import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withTransaction } from '@/lib/db';
import { getAuthorizedBranchIds, hasModulePermission } from '@/lib/auth/authorization';
import type { SessionUser } from '@/lib/auth/types';

export const fullOrderSchema = z.object({
 reference:z.string().trim().min(1).max(80), title:z.string().trim().min(1).max(160),
 expectedPieces:z.number().int().min(1).max(10000000).nullable(),
 branchIds:z.array(z.string().uuid()).min(1).max(2).refine(ids=>new Set(ids).size===ids.length),
}).strict();
export type FullExit = { id:string; order_id:string; reference:string; title:string; expected_pieces:number|null; created_at:string; branch_id:string; branch:string; movement_id:string; folio:string; status:string; pieces:number; pos_registered_at:string|null; registered_by:string|null; shipped_at:string|null; shipped_by_name:string|null; waived_at:string|null };
export async function requireFullAccess(user:SessionUser) {
 if(!await hasModulePermission(user,'SALIDAS'))throw Error('Sin permiso de Salidas.');
}
export async function createFullOrder(user:SessionUser,raw:unknown) {
 await requireFullAccess(user);
 if(user.role!=='MASTER')throw Error('Solo MASTER puede crear pedidos FULL.');
 const body=fullOrderSchema.parse(raw);
 return withTransaction(async c=>{
  const branches=await c.query(`SELECT id::text FROM branches WHERE id=ANY($1::uuid[]) AND status::text='ACTIVE' AND name IN ('Treviño','Plaza del Audio') ORDER BY id FOR SHARE`,[body.branchIds]);
  if(branches.rows.length!==body.branchIds.length)throw Error('Selecciona únicamente Plaza del Audio o Treviño activas.');
  const existing=await c.query('SELECT id FROM full_orders WHERE lower(btrim(reference))=lower($1)',[body.reference]);
  if(existing.rows.length)throw Error('Ya existe un pedido con ese número de Mercado Libre.');
  const order=await c.query<{id:string}>(`INSERT INTO full_orders(reference,title,expected_pieces,created_by) VALUES($1,$2,$3,$4) RETURNING id::text`,[body.reference,body.title,body.expectedPieces,user.id]);
  const id=order.rows[0].id;
  for(const branch of branches.rows){
   const folio=`SAL-${Date.now()}-${randomUUID().slice(0,8).toUpperCase()}`;
   const movement=await c.query<{id:string}>(`INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by) VALUES($1,'EXIT',$2,$3) RETURNING id::text`,[folio,branch.id,user.id]);
   await c.query(`INSERT INTO exits(movement_id,channel,exit_type) VALUES($1,'MERCADO_LIBRE','FULL')`,[movement.rows[0].id]);
   await c.query('INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES($1,$2,$3)',[id,branch.id,movement.rows[0].id]);
   await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,'FULL_ORDER_EXIT_CREATED',$4::jsonb)`,[user.id,branch.id,movement.rows[0].id,JSON.stringify({orderId:id,reference:body.reference,title:body.title,expectedPieces:body.expectedPieces})]);
  }
  return id;
 });
}
export async function fullOrderRows(user:SessionUser,id?:string,page=0,history=false):Promise<FullExit[]> {
 await requireFullAccess(user);
 if(id)z.string().uuid().parse(id);
 z.number().int().min(0).max(100000).parse(page);
 const ids=await getAuthorizedBranchIds(user);
 if(ids?.length===0)return [];
 return withTransaction(async c=>(await c.query<FullExit>(`SELECT o.id::text,o.id::text order_id,o.reference,o.title,o.expected_pieces,o.created_at::text,
 x.branch_id::text,b.name branch,m.id::text movement_id,m.folio,m.status::text,m.pos_registered_at::text,u.name registered_by,o.shipped_at::text,sender.name shipped_by_name,x.waived_at::text,
 COALESCE((SELECT sum(l.quantity) FROM exit_lines l WHERE l.movement_id=m.id),0)::int pieces
 FROM full_orders o JOIN full_order_exits x ON x.order_id=o.id JOIN inventory_movements m ON m.id=x.movement_id AND m.branch_id=x.branch_id
 JOIN branches b ON b.id=x.branch_id LEFT JOIN users u ON u.id=m.pos_registered_by LEFT JOIN users sender ON sender.id=o.shipped_by
 WHERE ($1::uuid[] IS NULL OR x.branch_id=ANY($1::uuid[])) AND ($2::uuid IS NULL OR o.id=$2)
 AND o.id IN (SELECT f.id FROM full_orders f WHERE ($2::uuid IS NULL OR f.id=$2) AND ($2::uuid IS NOT NULL OR (f.shipped_at IS NOT NULL)=$4) AND EXISTS(SELECT 1 FROM full_order_exits e JOIN inventory_movements pending ON pending.id=e.movement_id AND pending.branch_id=e.branch_id WHERE e.order_id=f.id AND ($1::uuid[] IS NULL OR e.branch_id=ANY($1::uuid[]))) ORDER BY f.created_at DESC,f.id DESC LIMIT 50 OFFSET $3)
 ORDER BY o.created_at DESC,o.id,b.name`,[ids,id??null,id?0:page*50,history])).rows);
}
export async function fullOrderProducts(user:SessionUser,id:string) {
 const rows=await fullOrderRows(user,id);
 if(!rows.length)return [];
 return withTransaction(async c=>(await c.query<{product:string;branch:string;quantity:number}>(`SELECT p.name product,b.name branch,sum(l.quantity)::int quantity FROM exit_lines l JOIN products p ON p.id=l.product_id JOIN inventory_movements m ON m.id=l.movement_id JOIN branches b ON b.id=m.branch_id WHERE m.id=ANY($1::uuid[]) AND m.status::text<>'CANCELLED' GROUP BY p.id,p.name,b.id,b.name ORDER BY p.name,b.name`,[rows.map(r=>r.movement_id)])).rows);
}
export function fullOrderStatus(rows:FullExit[]) {
 if(!rows.length)return 'Pendiente';
 if(rows[0].shipped_at)return 'Enviado';
 if(rows.every(r=>r.waived_at))return 'Sin aportación';
 rows=rows.filter(r=>!r.waived_at);
 if(rows.some(r=>r.status==='CANCELLED'))return 'Revisar salida cancelada';
 if(rows.every(r=>['POS_REGISTERED','POS_RECONCILED'].includes(r.status)))return 'Registrado';
 if(rows.some(r=>['CLOSED','PENDING_POS','POS_CORRECTION_PENDING'].includes(r.status)))return 'Pendiente de registro';
 return rows.some(r=>r.pieces>0)?'En preparación':'Pendiente';
}
