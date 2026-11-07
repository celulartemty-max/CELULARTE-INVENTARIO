import 'server-only';
import {withTransaction} from '@/lib/db';
import {assertBranchAccess,hasModulePermission} from '@/lib/auth/authorization';
import type {SessionUser} from '@/lib/auth/types';
export async function discardEmptyExit(user:SessionUser,id:string){
 if(!await hasModulePermission(user,'SALIDAS'))throw Error('Sin permiso de Salidas.');
 return withTransaction(async c=>{
  const q=await c.query<{id:string;branch_id:string;created_by:string;status:string;pos_registered_at:string|null}>(`SELECT id::text,branch_id::text,created_by::text,status::text,pos_registered_at FROM inventory_movements WHERE id=$1::uuid AND movement_type='EXIT' FOR UPDATE`,[id]);
  const m=q.rows[0];if(!m)throw Error('Salida no encontrada.');await assertBranchAccess(user,m.branch_id);
  if(user.role!=='MASTER'&&m.created_by!==user.id)throw Error('Solo el creador o MASTER puede descartar esta salida.');
  if(m.status!=='DRAFT'||m.pos_registered_at)throw Error('Solo se pueden descartar borradores vacíos.');
  const content=await c.query(`SELECT 1 FROM exit_lines WHERE movement_id=$1 LIMIT 1`,[id]);
  if(content.rows.length)throw Error('La salida ya tiene productos. No se puede descartar.');
  const full=await c.query(`SELECT 1 FROM full_order_exits WHERE movement_id=$1`,[id]);
  if(full.rows.length)throw Error('Esta salida pertenece a un pedido FULL.');
  await c.query(`UPDATE inventory_movements SET status='CANCELLED',updated_at=now() WHERE id=$1`,[id]);
  await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,previous_value,new_value) VALUES($1,$2,$3,'EMPTY_EXIT_DISCARDED',$4::jsonb,$5::jsonb)`,[user.id,m.branch_id,id,JSON.stringify({status:m.status}),JSON.stringify({status:'CANCELLED'})]);
 });
}
