import 'server-only';
import {createHash} from 'node:crypto';
import type {PoolClient} from '@neondatabase/serverless';
import {withTransaction} from '@/lib/db';
import {requireSystemRegistration} from '@/lib/auth/special-permissions';
import {assertBranchAccess} from '@/lib/auth/authorization';
import type {SessionUser} from '@/lib/auth/types';

export const originOrderLinesSql=`SELECT o.product_id,b.id carton_id,COALESCE(p.name,o.product_label) product,b.carton_number box,l.id line_id,l.model,l.color,l.counted quantity,b.counted_at::text counted_at
 FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN receiving_sessions s ON s.id=b.session_id
 LEFT JOIN products p ON p.id=o.product_id JOIN receiving_items l ON l.carton_id=b.id
 WHERE o.id=$1 AND NOT o.is_foreign AND o.voided_at IS NULL AND s.status='DRAFT'
 AND NOT EXISTS(SELECT 1 FROM receiving_origin_registrations r WHERE r.carton_id=b.id)
 ORDER BY b.id,l.id`;
export function originRevision(lines:unknown[]){return createHash('sha256').update(JSON.stringify(lines)).digest('hex');}

export async function recordOriginCartons(c:PoolClient,user:SessionUser,ids:string[]){
 if(!ids.length)throw Error('No hay cajas pendientes de registrar.');
 const r=await c.query(`INSERT INTO receiving_origin_registrations(carton_id,order_id,session_id,branch_id,counted_at,registered_by,snapshot)
 SELECT b.id,b.order_id,b.session_id,s.branch_id,b.counted_at,$2,
 jsonb_build_object('productId',o.product_id,'box',b.carton_number,'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM receiving_items l WHERE l.carton_id=b.id))
 FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id JOIN receiving_sessions s ON s.id=b.session_id
 WHERE b.id=ANY($1::uuid[]) AND NOT o.is_foreign AND o.voided_at IS NULL AND b.counted_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM receiving_items WHERE carton_id=b.id)
 AND NOT EXISTS(SELECT 1 FROM receiving_items WHERE carton_id=b.id AND counted IS NULL)
 AND NOT EXISTS(SELECT 1 FROM receiving_origin_registrations WHERE carton_id=b.id) RETURNING carton_id`,[ids,user.id]);
 if(r.rowCount!==ids.length)throw Error('Las cajas cambiaron o ya se registraron. Actualiza antes de confirmar.');
}

export async function confirmOriginOrder(user:SessionUser,orderId:string,revision:string|undefined){
 await requireSystemRegistration(user);
 return withTransaction(async c=>{
  // Same lock order as intake/counting: receipt, order, cartons. All receipts
  // are locked in ID order; the preview token also catches newly arrived boxes.
  await c.query(`SELECT s.id FROM receiving_sessions s WHERE s.id IN (SELECT session_id FROM receiving_cartons WHERE order_id=$1) ORDER BY s.id FOR UPDATE`,[orderId]);
  const order=(await c.query('SELECT * FROM receiving_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
  if(!order||order.is_foreign||order.voided_at)throw Error('Pedido no disponible.');
  await assertBranchAccess(user,order.branch_id);
  const boxes=(await c.query(`SELECT b.id,b.counted_at FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id WHERE b.order_id=$1 AND s.status='DRAFT' AND NOT EXISTS(SELECT 1 FROM receiving_origin_registrations r WHERE r.carton_id=b.id) ORDER BY b.id FOR UPDATE OF b`,[orderId])).rows;
  const lines=(await c.query(originOrderLinesSql,[orderId])).rows;
  if(!boxes.length||boxes.some(b=>!b.counted_at||!lines.some(l=>l.carton_id===b.id))||lines.some(l=>l.quantity===null)||!revision||originRevision(lines)!==revision)
   throw Error('El pedido cambió o tiene conteos pendientes. Vuelve a abrir el detalle antes de confirmar.');
  await recordOriginCartons(c,user,boxes.map(b=>b.id));
  await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_ORDER_POS_REGISTERED',$3::jsonb)`,[user.id,order.branch_id,JSON.stringify({orderId,cartonIds:boxes.map(b=>b.id),lines})]);
  return {ok:true};
 });
}
