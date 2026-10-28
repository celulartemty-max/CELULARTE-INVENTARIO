import 'server-only';
import { z } from 'zod';
import { withTransaction } from '@/lib/db';
import { assertBranchAccess, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';
import { receivingAccess } from './receiving';
import { isReviewer, packingSchema } from './receiving-validation';
import { resetPacking } from './packing-reset';
import { savePackingColorOrder, appendPackingColor } from './packing-column-order';

const uuid = z.string().uuid();
type Client = Parameters<Parameters<typeof withTransaction>[0]>[0];
export type DestinationOrder = { id: string; reference: string; product: string; marking: string; supplier: string; shipping: string; destination: string; origin: string; total: number; physical: number; arrived: number; counted: number; color_order?: string[] };
export type DestinationBox = { id: string; carton_number: string; origin: string | null; session_id: string | null; received_at: string | null; counted_at: string | null; notes: string };
export type DestinationItem = { id: string; carton_id: string; model: string; color: string; counted: number | null; expected: number | null };
export type DestinationView = { order: DestinationOrder; boxes: DestinationBox[]; items: DestinationItem[]; documents: { id: string; filename: string; previous?: boolean }[]; review: boolean; canRecount: boolean };

async function authorizedOrder(c: Client, u: SessionUser, orderId: string) {
    // Serialize all destination actions with origin edits to the same order.
    const order = (await c.query('SELECT * FROM receiving_orders WHERE id=$1 FOR UPDATE', [uuid.parse(orderId)])).rows[0];
    if (!order || order.voided_at || !order.destination_branch_id || order.destination_branch_id === order.branch_id)
        throw new Error('Pedido no disponible para recepción en destino.');
    await assertBranchAccess(u, order.destination_branch_id);
    return order;
}
async function audit(c: Client, u: SessionUser, branchId: string, action: string, value: unknown) {
    await c.query('INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,$3,$4::jsonb)', [u.id, branchId, action, JSON.stringify(value)]);
}
export async function destinationDocumentBranch(c: Client, u: SessionUser, orderId: string): Promise<string> {
    await receivingAccess(u, true);
    const o = await authorizedOrder(c, u, orderId);
    if (!(await c.query('SELECT 1 FROM receiving_destination_arrivals WHERE order_id=$1 AND branch_id=$2 LIMIT 1', [o.id, o.destination_branch_id])).rowCount)
        throw new Error('Confirma primero la llegada de cajas de este pedido.');
    return o.destination_branch_id;
}
export async function destinationOrders(u: SessionUser): Promise<DestinationOrder[]> {
    await receivingAccess(u);
    const ids = await getAuthorizedBranchIds(u);
    return withTransaction(async c => (await c.query(`SELECT o.id::text,o.reference,COALESCE(p.name,o.product_label,'Sin producto') product,o.marking,o.supplier,o.shipping,
        dest.name destination,origin.name origin,count(b.id)::int total,count(b.session_id)::int physical,count(a.carton_id)::int arrived,count(b.counted_at)::int counted
        FROM receiving_orders o JOIN branches dest ON dest.id=o.destination_branch_id JOIN branches origin ON origin.id=o.branch_id
        JOIN receiving_cartons b ON b.order_id=o.id LEFT JOIN products p ON p.id=o.product_id LEFT JOIN receiving_destination_arrivals a ON a.carton_id=b.id
        WHERE o.voided_at IS NULL AND o.destination_branch_id<>o.branch_id AND ($1::uuid[] IS NULL OR o.destination_branch_id=ANY($1::uuid[]))
        GROUP BY o.id,p.name,dest.name,origin.name ORDER BY o.created_at DESC`, [ids])).rows);
}
export async function destinationView(u: SessionUser, orderId: string): Promise<DestinationView> {
    await receivingAccess(u);
    return withTransaction(async c => {
        const o = await authorizedOrder(c, u, orderId);
        const order = (await c.query(`SELECT o.id::text,o.reference,o.color_order,COALESCE(p.name,o.product_label,'Sin producto') product,o.marking,o.supplier,o.shipping,
            dest.name destination,origin.name origin,count(b.id)::int total,count(b.session_id)::int physical,count(a.carton_id)::int arrived,count(b.counted_at)::int counted
            FROM receiving_orders o JOIN branches dest ON dest.id=o.destination_branch_id JOIN branches origin ON origin.id=o.branch_id
            JOIN receiving_cartons b ON b.order_id=o.id LEFT JOIN products p ON p.id=o.product_id LEFT JOIN receiving_destination_arrivals a ON a.carton_id=b.id
            WHERE o.id=$1 GROUP BY o.id,p.name,dest.name,origin.name`, [o.id])).rows[0];
        const boxes = (await c.query(`SELECT b.id::text,b.carton_number,b.session_id::text,origin.name origin,a.received_at::text,b.counted_at::text,b.notes
            FROM receiving_cartons b LEFT JOIN receiving_sessions s ON s.id=b.session_id LEFT JOIN branches origin ON origin.id=s.branch_id
            LEFT JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=$2 WHERE b.order_id=$1
            ORDER BY CASE WHEN b.carton_number ~ '^[0-9]+$' THEN b.carton_number::numeric END,b.carton_number,b.id`, [o.id, o.destination_branch_id])).rows;
        const review = isReviewer(u.role);
        const items = (await c.query(`SELECT l.id::text,l.carton_id::text,l.model,l.color,l.counted,
            CASE WHEN $3::boolean AND b.counted_at IS NOT NULL THEN l.expected ELSE NULL END expected
            FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id JOIN receiving_destination_arrivals a ON a.carton_id=b.id
            WHERE b.order_id=$1 AND a.branch_id=$2 ORDER BY l.model,l.color,l.id`, [o.id, o.destination_branch_id, review])).rows;
        const documents = review && boxes.some(b => b.received_at) ? (await c.query(`SELECT d.id::text,d.filename,EXISTS(SELECT 1 FROM audit_events a WHERE a.action='RECEIVING_PACKING_RESET' AND a.new_value->>'orderId'=d.order_id::text AND (a.new_value->'documentIds') ? d.id::text) previous FROM receiving_documents d WHERE d.order_id=$1 ORDER BY d.created_at,d.id`, [o.id])).rows : [];
        return { order, boxes, items, documents, review, canRecount: u.role === 'MASTER' };
    });
}
export async function destinationAction(u: SessionUser, body: Record<string, unknown>) {
    await receivingAccess(u);
    return withTransaction(async c => {
        const o = await authorizedOrder(c, u, uuid.parse(body.orderId));
        const branch = o.destination_branch_id;
        if (body.action === 'packingResetPreview' || body.action === 'resetPacking') {
            await receivingAccess(u,true);
            if (!(await c.query('SELECT 1 FROM receiving_destination_arrivals WHERE order_id=$1 AND branch_id=$2 LIMIT 1',[o.id,branch])).rowCount)
                throw new Error('Confirma primero la llegada de cajas de este pedido.');
            return resetPacking(c,u,o.id,branch,{...body,destination:true});
        }
        if (body.action === 'confirmArrival') {
            await receivingAccess(u, true);
            const ids = z.array(uuid).min(1).max(1000).refine(v => new Set(v).size === v.length).parse(body.boxIds);
            const boxes = (await c.query(`SELECT b.id,b.session_id,s.branch_id FROM receiving_cartons b
                LEFT JOIN receiving_sessions s ON s.id=b.session_id WHERE b.order_id=$1 AND b.id=ANY($2::uuid[]) ORDER BY b.id FOR UPDATE OF b`, [o.id, ids])).rows;
            if (boxes.length !== ids.length || boxes.some(b => !b.session_id || b.branch_id === branch))
                throw new Error('Selecciona solo cajas de este pedido que ya llegaron a la sucursal de origen.');
            const inserted = await c.query(`INSERT INTO receiving_destination_arrivals(carton_id,order_id,branch_id,origin_session_id,origin_branch_id,received_by)
                SELECT b.id,b.order_id,$3,b.session_id,s.branch_id,$4 FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id
                WHERE b.order_id=$1 AND b.id=ANY($2::uuid[]) ON CONFLICT(carton_id) DO NOTHING RETURNING carton_id`, [o.id, ids, branch, u.id]);
            await audit(c, u, branch, 'RECEIVING_DESTINATION_ARRIVAL', { orderId: o.id, boxIds: inserted.rows.map(b => b.carton_id) });
            return { ok: true };
        }
        if (body.action === 'packing') {
            await receivingAccess(u, true);
            const p = packingSchema.parse(body.packing);
            if (p.reference !== o.reference) throw new Error('Confirma la referencia de este pedido.');
            const boxes = (await c.query(`SELECT b.id,b.carton_number,b.counted_at,a.carton_id arrived FROM receiving_cartons b
                LEFT JOIN receiving_destination_arrivals a ON a.carton_id=b.id AND a.branch_id=$2 WHERE b.order_id=$1 ORDER BY b.id FOR UPDATE OF b`, [o.id, branch])).rows;
            const used = new Set<string>();
            for (const box of p.boxes) {
                const match = box.number.match(/^(\d+)\s*\/\s*(\d+)$/);
                if (match && Number(match[2]) !== boxes.length) throw new Error('El total del packing list no coincide con el pedido.');
                const number = match ? String(Number(match[1])) : box.number;
                const b = boxes.find(b => b.carton_number === box.number || b.carton_number === number);
                if (!b?.arrived || used.has(b.id)) throw new Error(`La caja ${box.number} no está confirmada en destino o está repetida.`);
                used.add(b.id);
                if (b.counted_at || (await c.query('SELECT 1 FROM receiving_items WHERE carton_id=$1 LIMIT 1', [b.id])).rowCount)
                    throw new Error(`La caja ${box.number} ya tiene contenido. No se mezclará ni sobrescribirá.`);
                await c.query(`INSERT INTO receiving_items(carton_id,model,color,expected) SELECT $1,upper(item->>'model'),upper(item->>'color'),(item->>'expected')::int FROM jsonb_array_elements($2::jsonb) item`, [b.id, JSON.stringify(box.items)]);
            }
            await savePackingColorOrder(c,o.id,p);
            await audit(c, u, branch, 'RECEIVING_DESTINATION_PACKING', { orderId: o.id, boxIds: [...used] });
            return { ok: true };
        }
        const boxId = uuid.parse(body.boxId);
        const b = (await c.query(`SELECT b.* FROM receiving_cartons b JOIN receiving_destination_arrivals a ON a.carton_id=b.id
            WHERE b.id=$1 AND b.order_id=$2 AND a.branch_id=$3 FOR UPDATE OF b`, [boxId, o.id, branch])).rows[0];
        if (!b) throw new Error('Primero confirma la llegada física de esta caja a la sucursal destino.');
        if (body.action === 'reopenBox') {
            if (u.role !== 'MASTER') throw new Error('Solo un administrador puede autorizar un reconteo.');
            if (!b.counted_at) throw new Error('La caja no tiene conteo terminado.');
            const previous = (await c.query('SELECT id,counted FROM receiving_items WHERE carton_id=$1', [boxId])).rows;
            await c.query('UPDATE receiving_cartons SET counted_at=NULL,counted_by=NULL WHERE id=$1', [boxId]);
            await c.query('UPDATE receiving_items SET counted=NULL WHERE carton_id=$1', [boxId]);
            await audit(c, u, branch, 'RECEIVING_DESTINATION_RECOUNT', { orderId: o.id, boxId, previous });
            return { ok: true };
        }
        if (b.counted_at) throw new Error('Esta caja ya tiene conteo terminado. Solicita un reconteo.');
        if (body.action === 'addItem') {
            const model = z.string().trim().max(160).parse(body.model).toUpperCase();
            const color = z.string().trim().max(160).parse(body.color).toUpperCase();
            if (!model && !color) throw new Error('Indica el modelo o color.');
            if ((await c.query('SELECT count(*)::int n FROM receiving_items WHERE carton_id=$1', [boxId])).rows[0].n >= 500) throw new Error('Máximo 500 combinaciones por caja.');
            await appendPackingColor(c,o.id,color);
            await c.query('INSERT INTO receiving_items(carton_id,model,color) VALUES($1,$2,$3)', [boxId, model, color]);
            await audit(c, u, branch, 'RECEIVING_DESTINATION_UNLISTED', { orderId: o.id, boxId, model, color });
            return { ok: true };
        }
        if (body.action !== 'saveCount' && body.action !== 'count') throw new Error('Acción no válida.');
        const saving = body.action === 'saveCount';
        const quantity = z.number().int().min(0).max(1000000);
        const lines = z.array(z.object({ id: uuid, quantity: saving ? quantity.nullable() : quantity })).min(1).max(500)
            .refine(v => new Set(v.map(l => l.id)).size === v.length).parse(body.lines);
        const notes = z.string().max(2000).parse(body.notes ?? '');
        const expected = (await c.query('SELECT id FROM receiving_items WHERE carton_id=$1', [boxId])).rows;
        const keys = new Set(expected.map(l => l.id));
        if (lines.length !== keys.size || lines.some(l => !keys.has(l.id))) throw new Error('Revisa todas las líneas de esta caja. Vacío no es cero.');
        await c.query('UPDATE receiving_items l SET counted=x.quantity FROM jsonb_to_recordset($1::jsonb) x(id uuid,quantity integer) WHERE l.id=x.id AND l.carton_id=$2', [JSON.stringify(lines), boxId]);
        if (saving) await c.query('UPDATE receiving_cartons SET notes=$1 WHERE id=$2', [notes, boxId]);
        else await c.query('UPDATE receiving_cartons SET notes=$1,counted_at=now(),counted_by=$2 WHERE id=$3', [notes, u.id, boxId]);
        await audit(c, u, branch, saving ? 'RECEIVING_DESTINATION_COUNT_SAVED' : 'RECEIVING_DESTINATION_COUNTED', { orderId: o.id, boxId, lines, notes });
        return { ok: true };
    });
}
