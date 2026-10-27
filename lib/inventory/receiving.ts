import 'server-only';
import { sql, withTransaction } from '@/lib/db';
import { assertBranchAccess, hasModulePermission } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';
import { arrivalSchema, countSchema, isReviewer, packingSchema, foreignCartonSchema, batchSchema, parseCartonNumbers } from './receiving-validation';
import { z } from 'zod';
import { shippingMarkSchema, destinationName } from './shipping-marks';
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
        const carrier = z.string().trim().max(160).parse(b.carrier ?? ''), tracking = z.string().trim().max(160).parse(b.tracking ?? '');
        await receivingAccess(u, true);
        await assertBranchAccess(u, x.branchId);
        return withTransaction(async (c) => {
            const branch = await c.query("SELECT 1 FROM branches WHERE id=$1 AND status='ACTIVE' AND name IN ('Treviño','Plaza del Audio')", [x.branchId]);
            if (!branch.rowCount)
                throw new Error('Sucursal no válida.');
            const r = await c.query('INSERT INTO receiving_sessions(branch_id,reference,arrival_date,total_boxes,cost,currency,notes,created_by,carrier,tracking) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [x.branchId, x.reference, x.date, x.total, x.cost, x.currency, x.notes, u.id, carrier, tracking]);
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
        if (b.action === 'batch') {
            await receivingAccess(u, true);
            const x = batchSchema.parse(b), numbers = parseCartonNumbers(x.numbers,x.total);
            const mark = shippingMarkSchema.parse(x.marking), supplier = z.string().trim().max(160).parse(b.supplier ?? '');
            const destination = destinationName(mark);
            const destinationId = destination ? (await c.query("SELECT id FROM branches WHERE name=$1 AND status='ACTIVE'",[destination])).rows[0]?.id : null;
            if(destination && !destinationId) throw new Error('Sucursal destino no disponible.');
            x.isForeign = !destinationId || destinationId !== s.branch_id;
            if(!x.isForeign && !x.productId) throw new Error('Selecciona el producto del catálogo para esta sucursal.');
            if (x.productId && !(await c.query("SELECT 1 FROM products WHERE id=$1 AND status='ACTIVE'",[x.productId])).rowCount) throw new Error('Producto no válido.');
            const physical = await c.query('SELECT (SELECT count(*) FROM receiving_cartons WHERE session_id=$1)::int + COALESCE((SELECT sum(carton_count) FROM receiving_foreign_cartons WHERE session_id=$1 AND voided_at IS NULL),0)::int n',[sessionId]);
            if (physical.rows[0].n + x.received > s.total_boxes) throw new Error('Se excede el total físico de esta recepción. Solo se suman las recibidas hoy.');
            const order = await c.query('INSERT INTO receiving_orders(branch_id,reference,product_id,product_label,shipping,marking,is_foreign,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id',[s.branch_id,x.reference,x.productId,x.productLabel||null,x.shipping,x.marking,x.isForeign,u.id]);
            if (!order.rowCount) throw new Error('Ese pedido ya existe. Registra sus faltantes sin crear otro pedido.');
            const orderId = order.rows[0].id;
            await c.query('UPDATE receiving_orders SET supplier=$1,destination_branch_id=$2 WHERE id=$3',[supplier,destinationId,orderId]);
            await c.query('INSERT INTO receiving_cartons(order_id,carton_number,session_id) SELECT $1,n::text,CASE WHEN n::text=ANY($4::text[]) THEN $3::uuid ELSE NULL END FROM generate_series(1,$2::int) n',[orderId,x.total,sessionId,numbers]);
            await audit(c,u,s.branch_id,'RECEIVING_BATCH_CREATED',{sessionId,orderId,...x});
            return {orderId};
        }
        if (b.action === 'packing') {
            await receivingAccess(u,true);
            const orderId = id.parse(b.orderId), p = packingSchema.parse(b.packing);
            const order = (await c.query('SELECT branch_id,is_foreign,reference FROM receiving_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
            if (!order || order.branch_id !== s.branch_id || order.is_foreign) throw new Error('Selecciona un pedido propio de esta sucursal.');
            if (p.reference !== order.reference) throw new Error('Confirma que el packing list corresponde al pedido seleccionado.');
            const cartons = await c.query('SELECT id,carton_number,counted_at FROM receiving_cartons WHERE order_id=$1 ORDER BY id FOR UPDATE',[orderId]);
            const used = new Set<string>();
            for (const box of p.boxes) {
                const match = box.number.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (match && Number(match[2]) !== cartons.rows.length) throw new Error('El total marcado en el packing list no coincide con el pedido.');
                const number = match ? String(Number(match[1])) : box.number;
                const carton = cartons.rows.find(r => r.carton_number === box.number) ?? cartons.rows.find(r => r.carton_number === number);
                if (!carton || used.has(carton.id)) throw new Error(`Caja ${box.number} no válida o repetida para este pedido.`);
                used.add(carton.id);
                const lines = await c.query('SELECT 1 FROM receiving_items WHERE carton_id=$1 LIMIT 1',[carton.id]);
                if (carton.counted_at || lines.rowCount) throw new Error(`La caja ${box.number} ya tiene contenido o conteo. No se sobrescribirá ni mezclará.`);
                await c.query("INSERT INTO receiving_items(carton_id,model,color,expected) SELECT $1,upper(item->>'model'),upper(item->>'color'),(item->>'expected')::int FROM jsonb_array_elements($2::jsonb) item",[carton.id,JSON.stringify(box.items)]);
            }
            await audit(c,u,s.branch_id,'RECEIVING_BATCH_PACKING_APPROVED',{sessionId,orderId,boxes:p.boxes.map(x=>x.number),documentReference:b.documentReference??null});
            return {orderId};
        }
        if (b.action === 'foreign' || b.action === 'voidForeign') {
            await receivingAccess(u, true);
            const recordId = b.recordId ? id.parse(b.recordId) : null;
            const before = recordId ? (await c.query('SELECT * FROM receiving_foreign_cartons WHERE id=$1 AND session_id=$2 AND voided_at IS NULL FOR UPDATE', [recordId, sessionId])).rows[0] : null;
            if (recordId && !before) throw new Error('Registro ajeno no disponible.');
            if (b.action === 'voidForeign') {
                if (!before) throw new Error('Selecciona el registro a anular.');
                await c.query('UPDATE receiving_foreign_cartons SET voided_at=now() WHERE id=$1', [recordId]);
                await audit(c, u, s.branch_id, 'RECEIVING_FOREIGN_VOIDED', { sessionId, previous: before });
                return { ok: true };
            }
            const x = foreignCartonSchema.parse(b);
            shippingMarkSchema.parse(x.marking);
            const n = await c.query('SELECT (SELECT count(*) FROM receiving_cartons WHERE session_id=$1)::int + COALESCE((SELECT sum(carton_count) FROM receiving_foreign_cartons WHERE session_id=$1 AND voided_at IS NULL),0)::int n', [sessionId]);
            if (n.rows[0].n - (before?.carton_count ?? 0) + x.quantity > s.total_boxes) throw new Error('Se excede el total físico de cajas de esta recepción.');
            if (before) {
                await c.query('UPDATE receiving_foreign_cartons SET product=$1,carton_count=$2,shipping=$3,marking=$4,notes=$5 WHERE id=$6', [x.product,x.quantity,x.shipping,x.marking,x.notes,recordId]);
            } else {
                await c.query('INSERT INTO receiving_foreign_cartons(session_id,product,carton_count,shipping,marking,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [sessionId,x.product,x.quantity,x.shipping,x.marking,x.notes,u.id]);
            }
            await audit(c, u, s.branch_id, 'RECEIVING_FOREIGN_SAVED', { sessionId, recordId, previous: before, ...x });
            return { ok: true };
        }
        if (b.action === 'editOrder') {
            await receivingAccess(u,true);
            const orderId=id.parse(b.orderId),marking=shippingMarkSchema.parse(b.marking),supplier=z.string().trim().max(160).parse(b.supplier??'');
            const before=(await c.query('SELECT * FROM receiving_orders WHERE id=$1 AND branch_id=$2 FOR UPDATE',[orderId,s.branch_id])).rows[0];
            if(!before || !(await c.query('SELECT 1 FROM receiving_cartons WHERE order_id=$1 AND session_id=$2 LIMIT 1',[orderId,sessionId])).rowCount) throw new Error('Pedido no disponible en esta recepción.');
            if(before.marking!==marking && (await c.query('SELECT 1 FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.order_id=$1 AND (l.counted IS NOT NULL OR b.counted_at IS NOT NULL) LIMIT 1',[orderId])).rowCount) throw new Error('El pedido ya tiene cantidades contadas. Requiere revisión antes de cambiar su Shipping Mark.');
            const destination=destinationName(marking),destinationId=destination?(await c.query("SELECT id FROM branches WHERE name=$1 AND status='ACTIVE'",[destination])).rows[0]?.id:null;
            if(destination&&!destinationId)throw new Error('Sucursal destino no disponible.');
            if(destinationId===s.branch_id&&!before.product_id)throw new Error('Este pedido necesita un producto del catálogo antes de cambiarlo a propio.');
            await c.query('UPDATE receiving_orders SET marking=$1,supplier=$2,destination_branch_id=$3,is_foreign=$4 WHERE id=$5',[marking,supplier,destinationId,!destinationId||destinationId!==s.branch_id,orderId]);
            await c.query('UPDATE receiving_cartons SET marking=NULL WHERE order_id=$1',[orderId]);
            await audit(c,u,s.branch_id,'RECEIVING_ORDER_EDITED',{orderId,previous:{marking:before.marking,supplier:before.supplier},marking,supplier,destinationId});
            return {ok:true};
        }
        if (b.action === 'markBox') throw new Error('La marca se edita para todo el pedido.');
        if (b.action === 'addItem') {
            const boxId = id.parse(b.boxId);
            const model = z.string().trim().max(160).parse(b.model).toUpperCase(), color = z.string().trim().max(160).parse(b.color).toUpperCase();
            if (!model && !color)
                throw new Error('Indica modelo o color del artículo adicional.');
            const box = await c.query('SELECT id FROM receiving_cartons WHERE id=$1 AND session_id=$2 AND counted_at IS NULL AND order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign) FOR UPDATE', [boxId, sessionId]);
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
            const q = await c.query('UPDATE receiving_cartons SET counted_at=NULL,counted_by=NULL WHERE id=$1 AND session_id=$2 AND counted_at IS NOT NULL AND order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign) RETURNING id', [boxId, sessionId]);
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
            const marking = shippingMarkSchema.parse(b.marking);
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
            const n = await c.query('SELECT (SELECT count(*) FROM receiving_cartons WHERE session_id=$1)::int + COALESCE((SELECT sum(carton_count) FROM receiving_foreign_cartons WHERE session_id=$1 AND voided_at IS NULL),0)::int n', [sessionId]);
            if (n.rows[0].n + ids.length > s.total_boxes)
                throw new Error('Se excede el total de cajas de esta recepción.');
            await c.query('UPDATE receiving_cartons SET session_id=$1 WHERE id=ANY($2::uuid[])', [sessionId, ids]);
            await audit(c, u, s.branch_id, 'RECEIVING_ARRIVAL', { sessionId, boxIds: ids });
            return { ok: true };
        }
        if (b.action === 'count' || b.action === 'saveCount') {
            const saving = b.action === 'saveCount';
            const boxId = id.parse(b.boxId), lines = saving ? z.array(z.object({ id, quantity: z.number().int().min(0).max(1000000).nullable() })).min(1).max(500).refine(v => new Set(v.map(l => l.id)).size === v.length).parse(b.lines) : countSchema.parse(b.lines), notes = z.string().max(2000).parse(b.notes ?? '');
            const box = await c.query('SELECT id,counted_at FROM receiving_cartons WHERE id=$1 AND session_id=$2 AND order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign) FOR UPDATE', [boxId, sessionId]);
            if (!box.rowCount || box.rows[0].counted_at)
                throw new Error('Caja no disponible para conteo.');
            const expected = await c.query('SELECT id FROM receiving_items WHERE carton_id=$1', [boxId]);
            const keys = new Set(expected.rows.map(x => x.id));
            if (!keys.size || lines.length !== keys.size || lines.some(x => !keys.has(x.id)))
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
            const n = await c.query('SELECT count(*)::int n,count(*) FILTER(WHERE counted_at IS NULL)::int pending FROM receiving_cartons WHERE session_id=$1 AND order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign)', [sessionId]);
            const foreign = await c.query('SELECT (SELECT count(*) FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id WHERE b.session_id=$1 AND o.is_foreign)::int + COALESCE((SELECT sum(carton_count) FROM receiving_foreign_cartons WHERE session_id=$1 AND voided_at IS NULL),0)::int n', [sessionId]);
            if (n.rows[0].n + foreign.rows[0].n !== s.total_boxes || n.rows[0].pending)
                throw new Error('Completa el total físico entre cajas de la sucursal y ajenas. Cuenta solo las de esta sucursal.');
            const status = n.rows[0].n === 0 ? 'ARCHIVED' : 'CLOSED';
            await c.query('UPDATE receiving_sessions SET status=$1 WHERE id=$2', [status,sessionId]);
            await audit(c, u, s.branch_id, 'RECEIVING_CLOSED', { sessionId, status, own: n.rows[0].n, foreign: foreign.rows[0].n });
            return { ok: true };
        }
        throw new Error('Acción no válida.');
    });
}
export async function receivingView(u: SessionUser, sessionId: string) {
    await receivingAccess(u);
    const rows = await sql `SELECT id::text,branch_id::text,reference,arrival_date::text,total_boxes,status,carrier,tracking FROM receiving_sessions WHERE id=${sessionId}::uuid`;
    const session = rows[0];
    if (!session)
        throw new Error('No encontrada');
    await assertBranchAccess(u, String(session.branch_id));
    const review = isReviewer(u.role);
    const boxes = await sql `SELECT b.id::text,b.carton_number,b.order_id::text,o.reference,o.shipping,COALESCE(b.marking,o.marking) marking,p.name product,b.counted_at::text,b.notes FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN products p ON p.id=o.product_id WHERE b.session_id=${sessionId}::uuid AND NOT o.is_foreign ORDER BY o.reference,b.carton_number`;
    const foreignBoxes = await sql `SELECT b.id::text,b.carton_number,b.order_id::text,o.reference,o.shipping,o.marking,COALESCE(p.name,o.product_label) product FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id LEFT JOIN products p ON p.id=o.product_id WHERE b.session_id=${sessionId}::uuid AND o.is_foreign ORDER BY o.reference,b.carton_number`;
    const foreign = await sql `SELECT id::text,product,carton_count,shipping,marking,notes FROM receiving_foreign_cartons WHERE session_id=${sessionId}::uuid AND voided_at IS NULL ORDER BY created_at,id`;
    // Expected values never enter the operative response, including server component props.
    const items = review ? await sql `SELECT l.id::text,l.carton_id::text,l.model,l.color,l.counted,CASE WHEN b.counted_at IS NOT NULL THEN l.expected ELSE NULL END expected FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.session_id=${sessionId}::uuid AND b.order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign) ORDER BY l.model,l.color` : await sql `SELECT l.id::text,l.carton_id::text,l.model,l.color,l.counted FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.session_id=${sessionId}::uuid AND b.order_id IN (SELECT id FROM receiving_orders WHERE NOT is_foreign) ORDER BY l.model,l.color`;
    const pending = review ? await sql `SELECT b.id::text,b.carton_number,b.order_id::text,o.reference,o.shipping,o.marking,o.is_foreign,COALESCE(p.name,o.product_label) product FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id LEFT JOIN products p ON p.id=o.product_id WHERE o.branch_id=${session.branch_id}::uuid AND b.session_id IS NULL ORDER BY o.reference,b.carton_number` : [];
    const batches = review ? await sql `SELECT o.id::text,o.reference,o.shipping,o.marking,o.supplier,o.is_foreign,COALESCE(p.name,o.product_label) product,count(b.id)::int total,count(b.session_id)::int received_total,count(b.id) FILTER(WHERE b.session_id=${sessionId}::uuid)::int received_here,count(b.id) FILTER(WHERE b.session_id IS NULL)::int remaining FROM receiving_orders o JOIN receiving_cartons b ON b.order_id=o.id LEFT JOIN products p ON p.id=o.product_id WHERE o.branch_id=${session.branch_id}::uuid GROUP BY o.id,p.name HAVING count(b.id) FILTER(WHERE b.session_id=${sessionId}::uuid OR b.session_id IS NULL)>0 ORDER BY o.created_at DESC` : [];
    const cost = review ? await sql `SELECT cost,currency,notes FROM receiving_sessions WHERE id=${sessionId}::uuid` : [];
    const documents = review ? await sql `SELECT d.id::text,d.filename,d.order_id::text FROM receiving_documents d WHERE d.session_id=${sessionId}::uuid OR d.order_id IN (SELECT id FROM receiving_orders WHERE branch_id=${session.branch_id}::uuid AND NOT is_foreign)` : [];
    const orders = review ? await sql `SELECT id::text,reference FROM receiving_orders WHERE branch_id=${session.branch_id}::uuid AND NOT is_foreign ORDER BY created_at DESC` : [];
    return { session, boxes, foreign, foreignBoxes, batches, items, pending, cost: cost[0] ?? null, documents, orders, review, canRecount: u.role === 'MASTER' };
}
