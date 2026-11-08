import 'server-only';
import {z} from 'zod';
import {withTransaction} from '@/lib/db';
import {requireFullAccess} from './full-orders';
import type {SessionUser} from '@/lib/auth/types';

const schema=z.object({id:z.string().uuid(),title:z.string().trim().min(1).max(160),previousTitle:z.string().min(1).max(160)}).strict();
export async function renameFullOrder(user:SessionUser,raw:unknown){
 if(user.role!=='MASTER')throw Error('Solo MASTER puede editar el nombre.');
 await requireFullAccess(user);
 const body=schema.parse(raw);
 return withTransaction(async c=>{
  const q=await c.query<{title:string}>(`SELECT title FROM full_orders WHERE id=$1::uuid FOR UPDATE`,[body.id]);
  const order=q.rows[0];if(!order)throw Error('Pedido no encontrado.');
  if(order.title!==body.previousTitle)throw Error('El nombre cambió. Recarga el pedido antes de editarlo.');
  if(order.title===body.title)return {title:order.title};
  const exits=await c.query<{branch_id:string;movement_id:string}>(`SELECT branch_id::text,movement_id::text FROM full_order_exits WHERE order_id=$1::uuid ORDER BY branch_id`,[body.id]);
  if(!exits.rows.length)throw Error('Pedido sin salidas vinculadas.');
  await c.query(`UPDATE full_orders SET title=$1 WHERE id=$2::uuid`,[body.title,body.id]);
  for(const exit of exits.rows)await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,previous_value,new_value) VALUES($1,$2,$3,'FULL_ORDER_RENAMED',$4::jsonb,$5::jsonb)`,[user.id,exit.branch_id,exit.movement_id,JSON.stringify({orderId:body.id,title:order.title}),JSON.stringify({orderId:body.id,title:body.title})]);
  return {title:body.title};
 });
}
