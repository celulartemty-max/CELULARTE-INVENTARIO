import 'server-only';
import {z} from 'zod';
import {assertBranchAccess} from '@/lib/auth/authorization';
import type {SessionUser} from '@/lib/auth/types';
import {requireFullAccess} from './full-orders';
import {runFullWorkflow} from './full-workflow-request';
const orderSchema=z.object({orderId:z.string().uuid()}).strict();
const waiveSchema=orderSchema.extend({movementId:z.string().uuid()}).strict();
export async function waiveFullContribution(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=waiveSchema.parse(raw);
 return runFullWorkflow(u,requestId,'waive',data,async c=>{
  const order=await c.query<{shipped_at:string|null}>('SELECT shipped_at FROM full_orders WHERE id=$1 FOR UPDATE',[data.orderId]);
  if(!order.rows.length||order.rows[0].shipped_at)throw Error('El pedido ya se envió o no está disponible.');
  const q=await c.query<{branch_id:string;status:string;pos_registered_at:string|null;waived_at:string|null}>(`SELECT m.branch_id::text,m.status::text,m.pos_registered_at,x.waived_at FROM full_order_exits x JOIN inventory_movements m ON m.id=x.movement_id AND m.branch_id=x.branch_id WHERE x.order_id=$1 AND x.movement_id=$2 FOR UPDATE OF m,x`,[data.orderId,data.movementId]);
  const m=q.rows[0];if(!m)throw Error('Salida no disponible.');await assertBranchAccess(u,m.branch_id);
  if(m.waived_at)return;
  if(m.status!=='DRAFT'||m.pos_registered_at)throw Error('Solo se permite en una salida vacía sin cerrar.');
  if((await c.query('SELECT 1 FROM exit_lines WHERE movement_id=$1 LIMIT 1',[data.movementId])).rows.length)throw Error('Hay piezas capturadas. No se puede marcar sin aportación.');
  await c.query('UPDATE full_order_exits SET waived_at=now(),waived_by=$1 WHERE movement_id=$2',[u.id,data.movementId]);
  await c.query("UPDATE inventory_movements SET status='CANCELLED',updated_at=now() WHERE id=$1",[data.movementId]);
  await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,'FULL_NO_CONTRIBUTION',$4::jsonb)`,[u.id,m.branch_id,data.movementId,JSON.stringify(data)]);
 });
}
export async function closeFullShipment(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=orderSchema.parse(raw);
 return runFullWorkflow(u,requestId,'ship',data,async c=>{
  // Treviño dispatches to ML. MASTER can dispatch any FULL.
  const branch=await c.query<{id:string}>("SELECT id::text FROM branches WHERE name='Treviño' AND status::text='ACTIVE'");
  if(branch.rows.length!==1)throw Error('Sucursal no disponible.');await assertBranchAccess(u,branch.rows[0].id);
  const order=await c.query<{shipped_at:string|null;expected_pieces:number|null}>('SELECT shipped_at,expected_pieces FROM full_orders WHERE id=$1 FOR UPDATE',[data.orderId]);
  if(!order.rows.length)throw Error('Pedido no disponible.');if(order.rows[0].shipped_at)return;
  const parts=await c.query<{movement_id:string;branch_id:string;branch:string;status:string;waived_at:string|null;pieces:number;reviewed:boolean}>(`SELECT m.id::text movement_id,m.branch_id::text,b.name branch,m.status::text,x.waived_at,COALESCE((SELECT sum(quantity) FROM exit_lines WHERE movement_id=m.id),0)::int pieces,EXISTS(SELECT 1 FROM full_exit_reviews WHERE movement_id=m.id) reviewed FROM full_order_exits x JOIN inventory_movements m ON m.id=x.movement_id AND m.branch_id=x.branch_id JOIN branches b ON b.id=x.branch_id WHERE x.order_id=$1 ORDER BY m.id FOR UPDATE OF m,x`,[data.orderId]);
  if(!parts.rows.length)throw Error('El pedido no tiene salidas.');
  for(const p of parts.rows){
   if(p.waived_at){if(p.pieces||p.status!=='CANCELLED')throw Error('Aportación inconsistente. Revisa el pedido.');continue;}
   if(!['CLOSED','PENDING_POS','POS_REGISTERED','POS_RECONCILED','POS_CORRECTION_PENDING'].includes(p.status))throw Error('Termina las capturas o marca Sin aportación antes de cerrar.');
   if(p.branch==='Plaza del Audio'&&!p.reviewed)throw Error('Primero revisa las piezas de Plaza.');
  }
  const total=parts.rows.reduce((n,p)=>n+p.pieces,0);
  if(!total)throw Error('No hay piezas para enviar.');
  if(order.rows[0].expected_pieces!==null&&total!==order.rows[0].expected_pieces)throw Error('El total no coincide con el FULL. MASTER debe ajustar el total antes de enviarlo.');
  await c.query('UPDATE full_orders SET shipped_at=now(),shipped_by=$1 WHERE id=$2',[u.id,data.orderId]);
  for(const p of parts.rows)await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,'FULL_SHIPPED',$4::jsonb)`,[u.id,p.branch_id,p.movement_id,JSON.stringify({...data,total})]);
 });
}
