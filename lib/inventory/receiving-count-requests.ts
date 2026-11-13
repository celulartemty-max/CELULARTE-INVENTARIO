import 'server-only';
import {z} from 'zod';
import {sql,withTransaction} from '@/lib/db';
import type {SessionUser} from '@/lib/auth/types';
import {receivingAccess} from './receiving';
export const countRequestOwner='6373f0fc-68dc-405c-a26e-00e6594031ca';
export async function countRequestList(u:SessionUser){
 await receivingAccess(u);
 if(u.id!==countRequestOwner)throw Error('Sin permiso para revisar solicitudes.');
 return sql`SELECT r.order_id::text,r.user_id::text,r.status,r.requested_at::text,u.name requester,o.marking,COALESCE(NULLIF(o.display_title,''),p.name,o.product_label,o.reference) product,
 (SELECT b.session_id::text FROM receiving_cartons b WHERE b.order_id=o.id AND b.session_id IS NOT NULL ORDER BY b.carton_number LIMIT 1) session_id
 FROM receiving_count_requests r JOIN users u ON u.id=r.user_id JOIN receiving_orders o ON o.id=r.order_id LEFT JOIN products p ON p.id=o.product_id
 WHERE r.status IN ('PENDING','APPROVED') AND o.voided_at IS NULL ORDER BY r.status DESC,r.requested_at`;
}
export async function countRequestAction(u:SessionUser,raw:unknown){
 await receivingAccess(u);
 const b=z.object({action:z.enum(['request','approve','deny']),orderId:z.string().uuid(),userId:z.string().uuid().optional()}).parse(raw);
 if(b.action!=='request'&&u.id!==countRequestOwner)throw Error('Solo la cuenta autorizada puede aprobar solicitudes.');
 return withTransaction(async c=>{
  const o=(await c.query(`SELECT o.id,o.marking,o.branch_id FROM receiving_orders o WHERE o.id=$1 AND o.voided_at IS NULL FOR UPDATE`,[b.orderId])).rows[0];
  if(!o||!['PER','JAPS'].includes(o.marking))throw Error('Pedido no disponible para solicitar conteo.');
  if(b.action==='request'){
   if(!(await c.query(`SELECT 1 FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id WHERE b.order_id=$1 AND b.counted_at IS NULL AND s.status='DRAFT' LIMIT 1`,[o.id])).rowCount)throw Error('Este pedido no tiene cajas abiertas pendientes de contar.');
   const changed=await c.query(`INSERT INTO receiving_count_requests(order_id,user_id) VALUES($1,$2)
    ON CONFLICT(order_id,user_id) DO UPDATE SET status='PENDING',requested_at=now(),decided_by=NULL,decided_at=NULL WHERE receiving_count_requests.status='DENIED' RETURNING order_id`,[o.id,u.id]);
   if(changed.rowCount)await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_COUNT_PERMISSION_REQUESTED',$3::jsonb)`,[u.id,o.branch_id,JSON.stringify({orderId:o.id,requesterId:u.id})]);
   return {ok:true};
  }
  if(!b.userId)throw Error('Selecciona la solicitud.');
  const changed=await c.query(`UPDATE receiving_count_requests SET status=$3,decided_by=$4,decided_at=now() WHERE order_id=$1 AND user_id=$2 AND status IN ('PENDING','APPROVED') RETURNING status`,[o.id,b.userId,b.action==='approve'?'APPROVED':'DENIED',u.id]);
  if(!changed.rowCount)throw Error('La solicitud ya cambió. Actualiza la página.');
  await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_COUNT_PERMISSION_DECIDED',$3::jsonb)`,[u.id,o.branch_id,JSON.stringify({orderId:o.id,requesterId:b.userId,status:changed.rows[0].status})]);
  return {ok:true};
 });
}
