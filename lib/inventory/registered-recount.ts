import 'server-only';
import {z} from 'zod';
import type {PoolClient} from '@neondatabase/serverless';
import type {SessionUser} from '@/lib/auth/types';
import {assertBranchAccess} from '@/lib/auth/authorization';
import {canCountReceivingMark} from './receiving-validation';

const uuid=z.string().uuid();
const lineSchema=z.array(z.object({id:uuid,quantity:z.number().int().min(0).max(1000000)})).min(1).max(500).refine(v=>new Set(v.map(x=>x.id)).size===v.length);
type Line={id:string;model:string;color:string;quantity:number};
async function log(c:PoolClient,u:SessionUser,branch:string,action:string,value:unknown){
 await c.query('INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,$3,$4::jsonb)',[u.id,branch,action,JSON.stringify(value)]);
}
export async function registeredRecountAction(c:PoolClient,u:SessionUser,session:{id:string;branch_id:string},body:Record<string,unknown>){
 const boxId=uuid.parse(body.boxId);
 const box=(await c.query(`SELECT b.id,b.counted_at,o.marking,o.id order_id,o.voided_at FROM receiving_cartons b JOIN receiving_orders o ON o.id=b.order_id WHERE b.id=$1 AND b.session_id=$2 FOR UPDATE OF b`,[boxId,session.id])).rows[0];
 if(!box||box.voided_at||!box.counted_at)throw Error('Caja no disponible para reconteo registrado.');
 const registered=(await c.query('SELECT 1 FROM receiving_origin_registrations WHERE carton_id=$1 UNION ALL SELECT 1 FROM receiving_destination_registrations WHERE carton_id=$1',[boxId])).rowCount;
 if(!registered)throw Error('Esta caja aún no está registrada. Usa el reconteo normal.');
 if(body.action==='authorizeRegisteredRecount'){
  if(u.role!=='MASTER')throw Error('Solo Máster puede autorizar el reconteo de cajas registradas.');
  await assertBranchAccess(u,session.branch_id);
  const pending=await c.query('SELECT id FROM receiving_registered_recounts WHERE carton_id=$1 AND registered_at IS NULL LIMIT 1',[boxId]);
  if(pending.rowCount)throw Error('Ya existe un reconteo activo o un ajuste pendiente de registrar para esta caja.');
  const baseline=(await c.query('SELECT id::text,model,color,counted quantity FROM receiving_items WHERE carton_id=$1 ORDER BY id',[boxId])).rows;
  if(!baseline.length||baseline.some(x=>x.quantity===null))throw Error('No hay conteo original completo.');
  const created=await c.query('INSERT INTO receiving_registered_recounts(carton_id,session_id,branch_id,authorized_by,baseline) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id',[boxId,session.id,session.branch_id,u.id,JSON.stringify(baseline)]);
  await log(c,u,session.branch_id,'RECEIVING_REGISTERED_RECOUNT_AUTHORIZED',{boxId,recountId:created.rows[0].id,baseline});
  return {ok:true};
 }
 const active=(await c.query('SELECT * FROM receiving_registered_recounts WHERE carton_id=$1 AND completed_at IS NULL FOR UPDATE',[boxId])).rows[0];
 if(!active)throw Error('El reconteo no está autorizado o ya fue terminado.');
 const countBranch=u.primaryBranchId?(await c.query("SELECT name FROM branches WHERE id=$1 AND status='ACTIVE'",[u.primaryBranchId])).rows[0]?.name:null;
 const granted=(await c.query("SELECT 1 FROM receiving_count_requests WHERE order_id=$1 AND user_id=$2 AND status='APPROVED'",[box.order_id,u.id])).rowCount>0;
 if(!granted&&!canCountReceivingMark(u,box.marking,countBranch??null))throw Error('No tienes permiso para contar esta caja.');
 const lines=lineSchema.parse(body.lines);
 const baseline=active.baseline as Line[];
 const byId=new Map(lines.map(l=>[l.id,l.quantity]));
 if(lines.length!==baseline.length||baseline.some(l=>!byId.has(l.id)))throw Error('Cuenta todas las líneas de la caja.');
 if(body.action==='saveRegisteredRecount'){
  await c.query('UPDATE receiving_registered_recounts SET draft=$2::jsonb WHERE id=$1',[active.id,JSON.stringify(lines)]);
  await log(c,u,session.branch_id,'RECEIVING_REGISTERED_RECOUNT_DRAFT',{boxId,recountId:active.id});
  return {ok:true};
 }
 if(body.action!=='finishRegisteredRecount')throw Error('Acción no válida.');
 const adjustments=baseline.map(l=>({...l,previousQuantity:l.quantity,newQuantity:byId.get(l.id),delta:(byId.get(l.id)??0)-l.quantity})).filter(l=>l.delta!==0);
 await c.query('UPDATE receiving_registered_recounts SET draft=$2::jsonb,adjustments=$3::jsonb,completed_by=$4,completed_at=now() WHERE id=$1 AND completed_at IS NULL',[active.id,JSON.stringify(lines),JSON.stringify(adjustments),u.id]);
 await log(c,u,session.branch_id,'RECEIVING_REGISTERED_RECOUNT_COMPLETED',{boxId,recountId:active.id,adjustments,registrationStatus:'PENDING'});
 return {ok:true,adjustments};
}
