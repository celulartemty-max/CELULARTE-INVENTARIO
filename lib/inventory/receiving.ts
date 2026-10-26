import 'server-only';
import { sql, withTransaction } from '@/lib/db';
import { assertBranchAccess, hasModulePermission } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';
import { arrivalSchema, countSchema, isReviewer, packingSchema } from './receiving-validation';
import { z } from 'zod';
export async function receivingAccess(u: SessionUser, review = false) {
    if (!await hasModulePermission(u, 'ENTRADAS') || (review && !isReviewer(u.role)))
        throw new Error('Sin permiso para esta acción.');
}
async function audit(c: Parameters<Parameters<typeof withTransaction>[0]>[0], u: SessionUser, branch: string, action: string, value: unknown) {
    await c.query('INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,$3,$4::jsonb)', [u.id, branch, action, JSON.stringify(value)]);
}
export async function receivingAction(u: SessionUser, b: Record<string, unknown>) {
    await receivingAccess(u);
    const id = z.string().uuid();
    if (b.action === 'create') {
        const x = z.object({ branchId: id, reference: z.string().trim().min(1).max(160), date: z.string().date(), total: z.number().int().min(1).max(1000), cost: z.number().min(0).max(999999999).nullable(), currency: z.enum(['MXN', 'USD', 'CNY']), notes: z.string().max(2000) }).parse(b);
        await receivingAccess(u, true);
        await assertBranchAccess(u, x.branchId);
        return withTransaction(async (c) => {
            const branch = await c.query("SELECT 1 FROM branches WHERE id=$1 AND status='ACTIVE' AND name IN ('Treviño','Plaza del Audio')", [x.branchId]);
            if (!branch.rowCount)
                throw new Error('Sucursal no válida.');
            const r = await c.query('INSERT INTO receiving_sessions(branch_id,reference,arrival_date,total_boxes,cost,currency,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [x.branchId, x.reference, x.date, x.total, x.cost, x.currency, x.notes, u.id]);
            await audit(c, u, x.branchId, 'RECEIVING_CREATED', { id: r.rows[0].id });
            return { id: r.rows[0].id };
        });
    }
    const sessionId = id.parse(b.sessionId);
    return withTransaction(async (c) => {
        const r = await c.query('SELECT * FROM receiving_sessions WHERE id=$1 FOR UPDATE', [sessionId]);
        const s = r.rows[0];
        if (!s)
            throw new Error('Recepción no encontrada.');
        await assertBranchAccess(u, s.branch_id);
        if (b.action === 'pos') {
            await receivingAccess(u, true);
            if (s.status !== 'CLOSED')
                throw new Error('Primero termina el conteo.');
            await c.query("UPDATE receiving_sessions SET status='POS_REGISTERED' WHERE id=$1", [sessionId]);
            await audit(c, u, s.branch_id, 'RECEIVING_POS_REGISTERED', { sessionId });
            return { ok: true };
        }
        if (s.status !== 'DRAFT')
            throw new Error('La recepción ya está cerrada.');
        if (b.action === 'addItem') {
            const boxId = id.parse(b.boxId);
            const model = z.string().trim().max(160).parse(b.model).toUpperCase(), color = z.string().trim().max(160).parse(b.color).toUpperCase();
            if (!model && !color)
                throw new Error('Indica modelo o color del artículo adicional.');
            const box = await c.query('SELECT id FROM receiving_cartons WHERE id=$1 AND session_id=$2 AND counted_at IS NULL FOR UPDATE', [boxId, sessionId]);
            if (!box.rowCount)
                throw new Error('Caja no disponible.');
            await c.query('INSERT INTO receiving_items(carton_id,model,color) VALUES($1,$2,$3)', [boxId, model, color]);
            await audit(c, u, s.branch_id, 'RECEIVING_UNLISTED_ITEM', { sessionId, boxId, model, color });
            return { ok: true };
        }
        if (b.action === 'reopenBox') {
            if (u.role !== 'MASTER')
                throw new Error('Solo un administrador puede autorizar un reconteo.');
            const boxId = id.parse(b.boxId);
            const before = await c.query('SELECT l.id,l.counted FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.id=$1 AND b.session_id=$2', [boxId, sessionId]);
            const q = await c.query('UPDATE receiving_cartons SET counted_at=NULL,counted_by=NULL WHERE id=$1 AND session_id=$2 AND counted_at IS NOT NULL RETURNING id', [boxId, sessionId]);
            if (!q.rowCount)
                throw new Error('Caja no disponible.');
            await audit(c, u, s.branch_id, 'RECEIVING_RECOUNT_AUTHORIZED', { sessionId, boxId, previous: before.rows });
            await c.query('UPDATE receiving_items SET counted=NULL WHERE carton_id=$1', [boxId]);
            return { ok: true };
        }
        if (b.action === 'order') {
            await receivingAccess(u, true);
            const p = packingSchema.parse(b.packing);
            const product = id.parse(b.productId);
            const shipping = z.enum(['AIR', 'SEA']).parse(b.shipping);
            const marking = z.enum(['JAPS', 'PER']).parse(b.marking);
            if (!p.reference)
                throw new Error('Indica la referencia del pedido.');
            const valid = await c.query("SELECT 1 FROM products WHERE id=$1 AND status='ACTIVE'", [product]);
            if (!valid.rowCount)
                throw new Error('Producto no válido.');
            const o = await c.query('INSERT INTO receiving_orders(branch_id,reference,product_id,shipping,marking,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [s.branch_id, p.reference, product, shipping, marking, u.id]);
            const orderId = o.rows[0].id;
            await c.query(`WITH boxes AS (INSERT INTO receiving_cartons(order_id,carton_number)
              SELECT $1::uuid,box->>'number' FROM jsonb_array_elements($2::jsonb) box RETURNING id,carton_number)
              INSERT INTO receiving_items(carton_id,model,color,expected)
              SELECT boxes.id,upper(item->>'model'),upper(item->>'color'),(item->>'expected')::int
              FROM jsonb_array_elements($2::jsonb) box JOIN boxes ON boxes.carton_number=box->>'number'
              CROSS JOIN LATERAL jsonb_array_elements(box->'items') item`, [orderId, JSON.stringify(p.boxes)]);
            await audit(c, u, s.branch_id, 'RECEIVING_ORDER_APPROVED', { orderId, sessionId, boxes: p.boxes.length });
            return { orderId };
        }
        if (b.action === 'arrive') {
            await receivingAccess(u, true);
            const ids = arrivalSchema.parse(b.boxIds);
            const boxes = await c.query('SELECT b.id,b.session_id,o.branch_id FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id WHERE b.id=ANY($1::uuid[]) ORDER BY b.id FOR UPDATE OF b', [ids]);
            if (boxes.rowCount !== ids.length || boxes.rows.some(x => x.session_id || x.branch_id !== s.branch_id))
                throw new Error('Caja ya recibida o de otra sucursal.');
            const n = await c.query('SELECT count(*)::int n FROM receiving_cartons WHERE session_id=$1', [sessionId]);
            if (n.rows[0].n + ids.length > s.total_boxes)
                throw new Error('Se excede el total de cajas de esta recepción.');
            await c.query('UPDATE receiving_cartons SET session_id=$1 WHERE id=ANY($2::uuid[])', [sessionId, ids]);
            await audit(c, u, s.branch_id, 'RECEIVING_ARRIVAL', { sessionId, boxIds: ids });
            return { ok: true };
        }
        if (b.action === 'count' || b.action === 'saveCount') {
            const saving = b.action === 'saveCount';
            const boxId = id.parse(b.boxId), lines = saving ? z.array(z.object({ id, quantity: z.number().int().min(0).max(1000000).nullable() })).min(1).max(500).refine(v => new Set(v.map(l => l.id)).size === v.length).parse(b.lines) : countSchema.parse(b.lines), notes = z.string().max(2000).parse(b.notes ?? '');
            const box = await c.query('SELECT id,counted_at FROM receiving_cartons WHERE id=$1 AND session_id=$2 FOR UPDATE', [boxId, sessionId]);
            if (!box.rowCount || box.rows[0].counted_at)
                throw new Error('Caja no disponible para conteo.');
            const expected = await c.query('SELECT id FROM receiving_items WHERE carton_id=$1', [boxId]);
            const keys = new Set(expected.rows.map(x => x.id));
            if (lines.length !== keys.size || lines.some(x => !keys.has(x.id)))
                throw new Error('Cuenta todas las líneas. Vacío no es cero.');
            await c.query('UPDATE receiving_items l SET counted=x.quantity FROM jsonb_to_recordset($1::jsonb) x(id uuid,quantity integer) WHERE l.id=x.id AND l.carton_id=$2',[JSON.stringify(lines),boxId]);
            if (!saving)
                await c.query('UPDATE receiving_cartons SET counted_at=now(),counted_by=$1,notes=$2 WHERE id=$3', [u.id, notes, boxId]);
            else
                await c.query('UPDATE receiving_cartons SET notes=$1 WHERE id=$2', [notes, boxId]);
            await audit(c, u, s.branch_id, saving ? 'RECEIVING_COUNT_DRAFT_SAVED' : 'RECEIVING_BOX_COUNTED', { sessionId, boxId, lines, notes });
            return { ok: true };
        }
        if (b.action === 'close') {
            await receivingAccess(u, true);
            const n = await c.query('SELECT count(*)::int n,count(*) FILTER(WHERE counted_at IS NULL)::int pending FROM receiving_cartons WHERE session_id=$1', [sessionId]);
            if (n.rows[0].n !== s.total_boxes || n.rows[0].pending)
                throw new Error('Asigna y cuenta todas las cajas que llegaron en esta recepción.');
            await c.query("UPDATE receiving_sessions SET status='CLOSED' WHERE id=$1", [sessionId]);
            await audit(c, u, s.branch_id, 'RECEIVING_CLOSED', { sessionId });
            return { ok: true };
        }
        throw new Error('Acción no válida.');
    });
}
export async function receivingView(u: SessionUser, sessionId: string) {
    await receivingAccess(u);
    const rows = await sql `SELECT id::text,branch_id::text,reference,arrival_date::text,total_boxes,status FROM receiving_sessions WHERE id=${sessionId}::uuid`;
    const session = rows[0];
    if (!session)
        throw new Error('No encontrada');
    await assertBranchAccess(u, String(session.branch_id));
    const review = isReviewer(u.role);
    const boxes = await sql `SELECT b.id::text,b.carton_number,b.order_id::text,o.reference,o.shipping,o.marking,p.name product,b.counted_at::text,b.notes FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN products p ON p.id=o.product_id WHERE b.session_id=${sessionId}::uuid ORDER BY o.reference,b.carton_number`;
    // Expected values never enter the operative response, including server component props.
    const items = review ? await sql `SELECT l.id::text,l.carton_id::text,l.model,l.color,l.counted,CASE WHEN b.counted_at IS NOT NULL THEN l.expected ELSE NULL END expected FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.session_id=${sessionId}::uuid ORDER BY l.model,l.color` : await sql `SELECT l.id::text,l.carton_id::text,l.model,l.color,l.counted FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.session_id=${sessionId}::uuid ORDER BY l.model,l.color`;
    const pending = review ? await sql `SELECT b.id::text,b.carton_number,o.reference,o.shipping,o.marking,p.name product FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN products p ON p.id=o.product_id WHERE o.branch_id=${session.branch_id}::uuid AND b.session_id IS NULL ORDER BY o.reference,b.carton_number` : [];
    const cost = review ? await sql `SELECT cost,currency,notes FROM receiving_sessions WHERE id=${sessionId}::uuid` : [];
    const documents = review ? await sql `SELECT d.id::text,d.filename,d.order_id::text FROM receiving_documents d WHERE d.session_id=${sessionId}::uuid OR d.order_id IN (SELECT id FROM receiving_orders WHERE branch_id=${session.branch_id}::uuid)` : [];
    const orders = review ? await sql `SELECT id::text,reference FROM receiving_orders WHERE branch_id=${session.branch_id}::uuid ORDER BY created_at DESC` : [];
    return { session, boxes, items, pending, cost: cost[0] ?? null, documents, orders, review, canRecount: u.role === 'MASTER' };
}
