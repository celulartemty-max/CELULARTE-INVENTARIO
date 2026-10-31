import 'server-only';
import {z} from 'zod';
import type {PoolClient} from '@neondatabase/serverless';
import type {SessionUser} from '@/lib/auth/types';

// Caller holds the receipt lock and has checked module and branch access.
export async function editReceipt(c:PoolClient,u:SessionUser,s:{id:string;branch_id:string;status:string;total_boxes:number},body:Record<string,unknown>){
 if(u.role!=='MASTER')throw Error('Solo el usuario Máster puede editar la recepción.');
 if(s.status!=='DRAFT')throw Error('La recepción está cerrada o registrada. No se puede modificar.');
 const x=z.object({total:z.number().int().min(1).max(1000),reason:z.string().trim().min(5).max(1000),remove:z.array(z.string().uuid()).max(1000).default([]),orderId:z.string().uuid().nullable().default(null),numbers:z.array(z.string().regex(/^[1-9]\d{0,3}$/)).max(1000).default([])}).parse(body);
 if(new Set(x.remove).size!==x.remove.length||new Set(x.numbers).size!==x.numbers.length)throw Error('Hay cajas repetidas en la selección.');
 const rows=(await c.query('SELECT * FROM receiving_cartons WHERE session_id=$1 ORDER BY id FOR UPDATE',[s.id])).rows;
 const removed=rows.filter(b=>x.remove.includes(b.id));
 if(removed.length!==x.remove.length)throw Error('Una caja ya no pertenece a esta recepción. Actualiza antes de guardar.');
 for(const b of removed){
  const protectedBox=(await c.query(`SELECT EXISTS(SELECT 1 FROM receiving_items WHERE carton_id=$1 AND counted IS NOT NULL) partial,
   EXISTS(SELECT 1 FROM receiving_destination_arrivals WHERE carton_id=$1) arrived,
   EXISTS(SELECT 1 FROM receiving_destination_registrations WHERE carton_id=$1) registered`,[b.id])).rows[0];
  if(b.counted_at||protectedBox.partial||protectedBox.arrived||protectedBox.registered)throw Error(`La caja ${b.carton_number} tiene conteo, llegada a destino o registro en sistema. No se retirará ni borrará su avance.`);
 }
 let added:unknown[]=[];
 if(x.numbers.length){
  if(!x.orderId)throw Error('Selecciona el pedido para agregar cajas.');
  const o=(await c.query('SELECT * FROM receiving_orders WHERE id=$1 AND branch_id=$2 AND voided_at IS NULL FOR UPDATE',[x.orderId,s.branch_id])).rows[0];
  if(!o||!rows.some(b=>b.order_id===x.orderId))throw Error('Selecciona un pedido de esta recepción.');
  const existing=(await c.query('SELECT * FROM receiving_cartons WHERE order_id=$1 ORDER BY id FOR UPDATE',[x.orderId])).rows;
  for(const number of x.numbers){const b=existing.find(b=>b.carton_number===number);if(b?.session_id||b?.counted_at||b&&x.remove.includes(b.id))throw Error(`La caja ${number} ya está recibida o no se puede agregar.`);}
  // Preserve all existing packing lines. New boxes start without content/counts.
  for(const number of x.numbers){const b=existing.find(b=>b.carton_number===number);
   if(b)await c.query('UPDATE receiving_cartons SET session_id=$1 WHERE id=$2',[s.id,b.id]);
   else await c.query('INSERT INTO receiving_cartons(order_id,carton_number,session_id) VALUES($1,$2,$3)',[x.orderId,number,s.id]);
  }
  added=x.numbers.map(number=>({orderId:x.orderId,number}));
 }
 const foreign=(await c.query('SELECT COALESCE(sum(carton_count),0)::int n FROM receiving_foreign_cartons WHERE session_id=$1 AND voided_at IS NULL',[s.id])).rows[0].n;
 const physical=rows.length-removed.length+x.numbers.length+Number(foreign);
 if(x.total<physical)throw Error(`El total no puede ser menor que las ${physical} cajas identificadas. Selecciona primero las cajas que deseas retirar.`);
 // Detach only: retains the carton, packing list and history as a pending arrival.
 if(removed.length)await c.query('UPDATE receiving_cartons SET session_id=NULL WHERE id=ANY($1::uuid[])',[x.remove]);
 await c.query('UPDATE receiving_sessions SET total_boxes=$1 WHERE id=$2',[x.total,s.id]);
 await c.query("INSERT INTO audit_events(user_id,branch_id,action,previous_value,new_value,reason) VALUES($1,$2,'RECEIVING_MASTER_EDITED',$3::jsonb,$4::jsonb,$5)",[u.id,s.branch_id,JSON.stringify({sessionId:s.id,total:s.total_boxes,removed}),JSON.stringify({sessionId:s.id,total:x.total,added,removedIds:x.remove}),x.reason]);
 return {ok:true};
}
