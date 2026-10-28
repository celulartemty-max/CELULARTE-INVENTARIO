import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { withTransaction } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/types';
type Client=Parameters<Parameters<typeof withTransaction>[0]>[0];

// Caller holds the receipt lock and has checked reviewer and branch permissions.
export async function removeReceivingOrder(c: Client,u: SessionUser,sessionId: string,branchId: string,body: Record<string,unknown>) {
    const orderId=z.string().uuid().parse(body.orderId);
    const order=(await c.query(`SELECT o.*,COALESCE(p.name,o.product_label,'Sin producto') product FROM receiving_orders o
        LEFT JOIN products p ON p.id=o.product_id WHERE o.id=$1 AND o.branch_id=$2 FOR UPDATE OF o`,[orderId,branchId])).rows[0];
    if(!order||order.voided_at)throw new Error('El pedido no está disponible o ya fue anulado.');
    const cartons=(await c.query('SELECT id,carton_number,session_id,counted_at,counted_by,notes FROM receiving_cartons WHERE order_id=$1 ORDER BY id FOR UPDATE',[orderId])).rows;
    const here=cartons.filter(b=>b.session_id===sessionId);
    if(!here.length)throw new Error('Este pedido no pertenece a esta recepción.');
    const items=(await c.query(`SELECT l.* FROM receiving_items l JOIN receiving_cartons b ON b.id=l.carton_id
        WHERE b.order_id=$1 ORDER BY l.id FOR UPDATE OF l`,[orderId])).rows;
    const documents=(await c.query('SELECT id,filename FROM receiving_documents WHERE order_id=$1 ORDER BY id FOR UPDATE',[orderId])).rows;
    const downstream=(await c.query(`SELECT EXISTS(SELECT 1 FROM receiving_destination_arrivals WHERE order_id=$1) arrived,
        EXISTS(SELECT 1 FROM receiving_destination_registrations WHERE order_id=$1) registered`,[orderId])).rows[0];
    const blocked=cartons.some(b=>b.session_id&&b.session_id!==sessionId)
        ? 'Este pedido tiene cajas vinculadas a otra recepción. Requiere una corrección supervisada para no afectar otras llegadas.'
        : downstream?.arrived||downstream?.registered
            ? 'Ya se confirmó la llegada a destino o un registro en sistema. Requiere una corrección supervisada.'
            : cartons.some(b=>b.counted_at)||items.some(l=>l.counted!==null)
                ? 'Este pedido ya tiene conteos o avances guardados, incluso cantidades en cero. No se borrarán; requiere una corrección supervisada.' : '';
    const revision=createHash('sha256').update(JSON.stringify({order,cartons,items,documents,downstream})).digest('hex');
    const preview={revision,reference:order.reference,product:order.product,marking:order.marking,shipping:order.shipping,total:cartons.length,
        received:here.length,boxes:here.map(b=>b.carton_number).sort((a,b)=>a.localeCompare(b,'es',{numeric:true})),pending:cartons.filter(b=>!b.session_id).length,blocked};
    if(body.action==='removeOrderPreview')return preview;
    if(blocked)throw new Error(blocked);
    if(z.string().parse(body.revision)!==revision)throw new Error('El pedido cambió mientras lo revisabas. Cierra y vuelve a abrir la confirmación.');
    const reason=z.string().trim().min(5,'Escribe el motivo (mínimo 5 caracteres).').max(1000).parse(body.reason);
    await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_ORDER_REMOVED',$3::jsonb)`,
        [u.id,branchId,JSON.stringify({sessionId,orderId,reason,previous:order,cartons,items,documents,product:order.product,marking:order.marking,shipping:order.shipping,received:here.length})]);
    // Reserve an internal archival reference, freeing the original for recapture.
    // The original reference remains on the row and in the complete audit snapshot.
    await c.query("UPDATE receiving_orders SET voided_at=now(),voided_reference=reference,reference='ANULADO-'||id::text WHERE id=$1",[orderId]);
    await c.query('UPDATE receiving_cartons SET session_id=NULL WHERE order_id=$1 AND session_id=$2',[orderId,sessionId]);
    return {ok:true};
}
