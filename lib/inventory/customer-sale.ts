import 'server-only';
import type {PoolClient} from '@neondatabase/serverless';
import {withTransaction} from '@/lib/db';
import {assertBranchAccess,hasModulePermission} from '@/lib/auth/authorization';
import {requireSystemRegistration} from '@/lib/auth/special-permissions';
import type {SessionUser} from '@/lib/auth/types';

async function lock(c:PoolClient,u:SessionUser,id:string){
 if(!await hasModulePermission(u,'TRASPASOS'))throw Error('Sin permiso de Traspasos.');
 const q=await c.query('SELECT * FROM transfers WHERE movement_id=$1::uuid FOR UPDATE',[id]);
 const t=q.rows[0];if(!t?.customer_sale)throw Error('No es una venta con entrega en otra sucursal.');
 if(t.status==='CANCELLED'||t.status==='COMPLETED')throw Error('El movimiento ya está cerrado.');
 return t;
}
export async function completeCustomerSale(c:PoolClient,id:string,u:SessionUser){
 await c.query("UPDATE transfers SET status='COMPLETED' WHERE movement_id=$1 AND customer_sale AND received_at IS NOT NULL AND paid_at IS NOT NULL AND origin_pos_registered_at IS NOT NULL",[id]);
 await c.query("UPDATE inventory_movements m SET status='CLOSED',closed_by=$2,closed_at=now(),updated_at=now() WHERE m.id=$1 AND EXISTS(SELECT 1 FROM transfers t WHERE t.movement_id=m.id AND t.customer_sale AND t.status='COMPLETED')",[id,u.id]);
}
export async function payCustomerSale(u:SessionUser,id:string,branch:string){
 return withTransaction(async c=>{
  const t=await lock(c,u,id);
  if(branch!==t.destination_branch_id)throw Error('El pago corresponde únicamente a la sucursal receptora.');
  await assertBranchAccess(u,branch);
  if(t.paid_at)throw Error('El pago ya fue confirmado.');
  const n=await c.query('SELECT count(*)::int n FROM transfer_lines WHERE transfer_id=$1',[t.id]);
  if(!n.rows[0].n)throw Error('Agrega los productos antes de confirmar el pago.');
  await c.query('UPDATE transfers SET paid_at=now(),paid_by=$2,paid_branch_id=$3 WHERE id=$1',[t.id,u.id,branch]);
  await c.query("INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,'CUSTOMER_SALE_PAID',$4::jsonb)",[u.id,branch,id,JSON.stringify({paid:true,branchId:branch})]);
  await completeCustomerSale(c,id,u);
 });
}
export async function registerCustomerSale(u:SessionUser,id:string){
 await requireSystemRegistration(u);
 return withTransaction(async c=>{
  const t=await lock(c,u,id);await assertBranchAccess(u,t.origin_branch_id);
  if(!t.paid_at||!t.sent_at||t.status==='RECEIVED_WITH_DIFFERENCES')throw Error('Confirma el pago y el envío; resuelve cualquier diferencia antes de registrar la venta.');
  if(t.origin_pos_registered_at)throw Error('La venta ya fue registrada.');
  const photo=await c.query("SELECT 1 FROM audit_events WHERE user_id=$1 AND movement_id=$2 AND branch_id=$3 AND action='POS_EVIDENCE_CAPTURED' AND created_at>now()-interval '10 minutes'",[u.id,id,t.origin_branch_id]);
  if(!photo.rowCount)throw Error('Agrega una foto del registro de venta en sistema.');
  await c.query('UPDATE transfers SET origin_pos_registered_by=$2,origin_pos_registered_at=now() WHERE id=$1',[t.id,u.id]);
  await c.query("INSERT INTO pos_registration_events(movement_id,branch_id,event_type,transfer_side,movement_version,user_id) SELECT $1,$2,'INITIAL','ORIGIN',current_version,$3 FROM inventory_movements WHERE id=$1",[id,t.origin_branch_id,u.id]);
  await c.query("INSERT INTO audit_events(user_id,branch_id,movement_id,action) VALUES($1,$2,$3,'CUSTOMER_SALE_REGISTERED')",[u.id,t.origin_branch_id,id]);
  await completeCustomerSale(c,id,u);
 });
}
