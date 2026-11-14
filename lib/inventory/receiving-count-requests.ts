import 'server-only';
import {z} from 'zod';
import {sql,withTransaction} from '@/lib/db';
import type {SessionUser} from '@/lib/auth/types';
import {receivingAccess} from './receiving';
export const countRequestOwner='6373f0fc-68dc-405c-a26e-00e6594031ca';
export async function countRequestList(u:SessionUser){
 await receivingAccess(u);
 if(u.id!==countRequestOwner)throw Error('Sin permiso para revisar solicitudes.');
 return sql`SELECT r.order_id::text,r.user_id::text,r.status,r.requested_at::text,u.name requester,o.marking,(SELECT name FROM branches WHERE id=o.destination_branch_id) destination,COALESCE(NULLIF(o.display_title,''),p.name,o.product_label,o.reference) product,
 (SELECT b.session_id::text FROM receiving_cartons b WHERE b.order_id=o.id AND b.session_id IS NOT NULL ORDER BY b.carton_number LIMIT 1) session_id
 FROM receiving_count_requests r JOIN users u ON u.id=r.user_id JOIN receiving_orders o ON o.id=r.order_id LEFT JOIN products p ON p.id=o.product_id
 WHERE r.status IN ('PENDING','APPROVED') AND o.voided_at IS NULL ORDER BY r.status DESC,r.requested_at`;
}
export async function countRequestAction(u:SessionUser,raw:unknown){
 await receivingAccess(u);
 const b=z.object({action:z.enum(['request','approve','deny','destination']),orderId:z.string().uuid(),userId:z.string().uuid().optional(),destination:z.enum(['Treviño','Plaza del Audio']).optional()}).parse(raw);
 if(b.action!=='request'&&u.id!==countRequestOwner)throw Error('Solo la cuenta autorizada puede aprobar solicitudes.');
 return withTransaction(async c=>{
  // Routing takes the same receipt -> order locks as origin POS confirmation.
  if(b.action==='destination')await c.query(`SELECT s.id FROM receiving_sessions s WHERE s.id IN (SELECT session_id FROM receiving_cartons WHERE order_id=$1) ORDER BY s.id FOR UPDATE`,[b.orderId]);
  const o=(await c.query(`SELECT o.id,o.marking,o.branch_id,o.destination_branch_id,o.is_foreign,o.product_id,o.is_mixed FROM receiving_orders o WHERE o.id=$1 AND o.voided_at IS NULL FOR UPDATE`,[b.orderId])).rows[0];
  if(!o||!['PER','JAPS'].includes(o.marking))throw Error('Pedido no disponible para solicitar conteo.');
  if(b.action==='request'){
   if(!(await c.query(`SELECT 1 FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id WHERE b.order_id=$1 AND b.counted_at IS NULL AND s.status='DRAFT' LIMIT 1`,[o.id])).rowCount)throw Error('Este pedido no tiene cajas abiertas pendientes de contar.');
   const changed=await c.query(`INSERT INTO receiving_count_requests(order_id,user_id) VALUES($1,$2)
    ON CONFLICT(order_id,user_id) DO UPDATE SET status='PENDING',requested_at=now(),decided_by=NULL,decided_at=NULL WHERE receiving_count_requests.status='DENIED' RETURNING order_id`,[o.id,u.id]);
   if(changed.rowCount)await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_COUNT_PERMISSION_REQUESTED',$3::jsonb)`,[u.id,o.branch_id,JSON.stringify({orderId:o.id,requesterId:u.id})]);
   return {ok:true};
  }
  if(!b.userId)throw Error('Selecciona la solicitud.');
  if(b.action==='destination'){
   if(!b.destination)throw Error('Selecciona Plaza del Audio o Treviño.');
   if(!(await c.query(`SELECT 1 FROM receiving_count_requests WHERE order_id=$1 AND user_id=$2 AND status='APPROVED'`,[o.id,b.userId])).rowCount)throw Error('Primero autoriza la solicitud de conteo.');
   const destination=(await c.query(`SELECT id,name FROM branches WHERE name=$1 AND status='ACTIVE'`,[b.destination])).rows[0];
   if(!destination)throw Error('Sucursal destino no disponible.');
   if(destination.id===o.destination_branch_id)return {ok:true,destination:destination.name};
   if((await c.query(`SELECT 1 FROM receiving_origin_registrations WHERE order_id=$1 UNION ALL SELECT 1 FROM receiving_destination_registrations WHERE order_id=$1 LIMIT 1`,[o.id])).rowCount)throw Error('El pedido ya tiene cajas registradas en sistema. No se puede cambiar su destino.');
   if((await c.query(`SELECT 1 FROM receiving_cartons b JOIN receiving_sessions s ON s.id=b.session_id WHERE b.order_id=$1 AND s.status<>'DRAFT' LIMIT 1`,[o.id])).rowCount)throw Error('El pedido tiene una recepción cerrada. Revisa sus registros antes de cambiar el destino.');
   if((await c.query(`SELECT 1 FROM receiving_destination_arrivals WHERE order_id=$1 LIMIT 1`,[o.id])).rowCount)throw Error('Ya se confirmó la llegada en otra sucursal. Revisa esa recepción antes de cambiar el destino.');
   if(destination.id===o.branch_id&&!o.product_id&&!o.is_mixed)throw Error('El pedido necesita un producto del catálogo.');
   const isForeign=destination.id!==o.branch_id;
   await c.query(`UPDATE receiving_orders SET destination_branch_id=$2,is_foreign=$3 WHERE id=$1`,[o.id,destination.id,isForeign]);
   await c.query(`INSERT INTO audit_events(user_id,branch_id,action,previous_value,new_value) VALUES($1,$2,'RECEIVING_DESTINATION_CHANGED',$3::jsonb,$4::jsonb)`,[u.id,o.branch_id,JSON.stringify({orderId:o.id,destinationBranchId:o.destination_branch_id,isForeign:o.is_foreign,marking:o.marking}),JSON.stringify({orderId:o.id,requesterId:b.userId,destinationBranchId:destination.id,destination:destination.name,isForeign,marking:o.marking,countsPreserved:true})]);
   return {ok:true,destination:destination.name};
  }
  const changed=await c.query(`UPDATE receiving_count_requests SET status=$3,decided_by=$4,decided_at=now() WHERE order_id=$1 AND user_id=$2 AND status IN ('PENDING','APPROVED') RETURNING status`,[o.id,b.userId,b.action==='approve'?'APPROVED':'DENIED',u.id]);
  if(!changed.rowCount)throw Error('La solicitud ya cambió. Actualiza la página.');
  await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_COUNT_PERMISSION_DECIDED',$3::jsonb)`,[u.id,o.branch_id,JSON.stringify({orderId:o.id,requesterId:b.userId,status:changed.rows[0].status})]);
  return {ok:true};
 });
}
