import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from '@neondatabase/serverless';
import type {SessionUser} from '@/lib/auth/types';
import {assertBranchAccess,getAuthorizedBranchIds} from '@/lib/auth/authorization';
import {requireSystemRegistration} from '@/lib/auth/special-permissions';
import {withTransaction} from '@/lib/db';
import {requireFullAccess} from './full-orders';
import {runFullWorkflow} from './full-workflow-request';

const uuid=z.string().uuid();
export const finalCountSchema=z.object({orderId:uuid,previousRevision:z.number().int().min(0),lines:z.array(z.object({productId:uuid,quantity:z.number().int().min(0).max(10000000)}).strict()).min(1).max(500).refine(a=>new Set(a.map(l=>l.productId)).size===a.length),reason:z.string().trim().min(1).max(500)}).strict();
export const plazaSnapshotSql=`SELECT x.movement_id::text,m.status::text,x.waived_at::text,m.current_version,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('product_id',q.product_id,'quantity',q.quantity) ORDER BY q.product_id) FROM (SELECT product_id,sum(quantity)::int quantity FROM exit_lines WHERE movement_id=m.id GROUP BY product_id) q),'[]'::jsonb) lines
 FROM full_order_exits x JOIN inventory_movements m ON m.id=x.movement_id JOIN branches b ON b.id=x.branch_id WHERE x.order_id=$1 AND b.name='Plaza del Audio' ORDER BY x.movement_id`;
type Plaza={movement_id:string;status:string;waived_at:string|null;current_version:number;lines:{product_id:string;quantity:number}[]};
export type FinalLine={product_id:string;product:string;final_quantity:number;plaza_quantity:number;registered_delta:number};
export type FinalCount={order_id:string;branch_id:string;revision:number;total:number;plaza_snapshot:Plaza[];lines:FinalLine[];stale:boolean};
export function finalAdjustment(lines:FinalLine[],side:'origin'|'destination'){
 return lines.map(l=>({...l,quantity:side==='origin'?l.final_quantity-l.plaza_quantity-l.registered_delta:l.registered_delta-(l.final_quantity-l.plaza_quantity)})).filter(l=>l.quantity>0);
}
function fingerprint(revision:number,lines:FinalLine[]){return createHash('sha256').update(JSON.stringify({revision,lines})).digest('hex');}
async function trevino(c:PoolClient,u:SessionUser){const b=(await c.query<{id:string}>("SELECT id::text FROM branches WHERE name='Treviño' AND status::text='ACTIVE'")).rows;if(b.length!==1)throw Error('Treviño no disponible.');await assertBranchAccess(u,b[0].id);return b[0].id;}
export async function readFinalCount(c:PoolClient,id:string):Promise<FinalCount|null>{
 const row=(await c.query<Omit<FinalCount,'lines'|'stale'>>('SELECT order_id::text,branch_id::text,revision,total,plaza_snapshot FROM full_final_counts WHERE order_id=$1',[id])).rows[0];
 if(!row)return null;
 const lines=(await c.query<FinalLine>('SELECT l.product_id::text,p.name product,l.final_quantity,l.plaza_quantity,l.registered_delta FROM full_final_count_lines l JOIN products p ON p.id=l.product_id WHERE l.order_id=$1 ORDER BY l.product_id',[id])).rows;
 const plaza=(await c.query<Plaza>(plazaSnapshotSql,[id])).rows;
 const stable=(a:Plaza[])=>a.map(({movement_id,current_version,waived_at,lines,status})=>({movement_id,current_version,waived_at,lines,ready:waived_at?status==='CANCELLED':['CLOSED','PENDING_POS','POS_REGISTERED','POS_RECONCILED','POS_CORRECTION_PENDING'].includes(status)}));
 return {...row,lines,stale:JSON.stringify(stable(plaza))!==JSON.stringify(stable(row.plaza_snapshot))};
}
export async function finalCountView(u:SessionUser,id:string){
 await requireFullAccess(u);uuid.parse(id);const ids=await getAuthorizedBranchIds(u);
 return withTransaction(async c=>{const scope=(await c.query('SELECT 1 FROM full_order_exits WHERE order_id=$1 AND ($2::uuid[] IS NULL OR branch_id=ANY($2::uuid[])) LIMIT 1',[id,ids])).rows;if(!scope.length)throw Error('Pedido no disponible.');return readFinalCount(c,id);});
}
export async function saveFinalCount(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const d=finalCountSchema.parse(raw);
 return runFullWorkflow(u,requestId,'finalCount',d,async c=>{
  const branch=await trevino(c,u);
  const o=(await c.query<{shipped_at:string|null}>('SELECT shipped_at FROM full_orders WHERE id=$1 FOR UPDATE',[d.orderId])).rows[0];if(!o||o.shipped_at)throw Error('El FULL ya se envió o no está disponible.');
  const before=await readFinalCount(c,d.orderId);if((before?.revision??0)!==d.previousRevision)throw Error('El conteo cambió. Actualiza antes de guardar.');
  // Never silently replace legacy Treviño captures, especially registered exits.
  const legacy=(await c.query(`SELECT 1 FROM full_order_exits x JOIN inventory_movements m ON m.id=x.movement_id WHERE x.order_id=$1 AND x.branch_id=$2 AND (m.pos_registered_at IS NOT NULL OR EXISTS(SELECT 1 FROM exit_lines WHERE movement_id=m.id) OR (x.waived_at IS NULL AND m.status::text<>'DRAFT')) LIMIT 1`,[d.orderId,branch])).rows;
  if(legacy.length)throw Error('Treviño ya tiene una salida capturada con el flujo anterior. Se requiere revisar esa salida antes de generar otro ajuste.');
  const plaza=(await c.query<Plaza>(plazaSnapshotSql,[d.orderId])).rows;
  if(plaza.some(p=>p.waived_at?p.lines.length>0||p.status!=='CANCELLED':!['CLOSED','PENDING_POS','POS_REGISTERED','POS_RECONCILED','POS_CORRECTION_PENDING'].includes(p.status)))throw Error('Primero termina la captura de Plaza o marca Sin aportación.');
  if((await c.query('SELECT 1 FROM full_exit_reviews WHERE order_id=$1 LIMIT 1',[d.orderId])).rows.length)throw Error('Este FULL tiene una revisión anterior. Requiere revisar su historial antes de usar el ajuste global.');
  const total=d.lines.reduce((n,l)=>n+l.quantity,0);if(total<1||total>10000000)throw Error('Captura un total final entre 1 y 10,000,000.');
  const base=new Map<string,number>();for(const p of plaza)for(const l of p.lines)base.set(l.product_id,(base.get(l.product_id)??0)+l.quantity);
  const finals=new Map(d.lines.map(l=>[l.productId,l.quantity]));
  const products=[...new Set([...base.keys(),...finals.keys(),...(before?.lines.map(l=>l.product_id)??[])])].sort();
  const valid=(await c.query('SELECT id FROM products WHERE id=ANY($1::uuid[])',[products])).rows;if(valid.length!==products.length)throw Error('Hay un estilo no disponible.');
  const revision=d.previousRevision+1;
  await c.query(`INSERT INTO full_final_counts(order_id,branch_id,revision,total,plaza_snapshot,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT(order_id) DO UPDATE SET revision=excluded.revision,total=excluded.total,plaza_snapshot=excluded.plaza_snapshot,updated_at=now()`,[d.orderId,branch,revision,total,JSON.stringify(plaza),u.id]);
  for(const product of products)await c.query(`INSERT INTO full_final_count_lines(order_id,product_id,final_quantity,plaza_quantity) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,product_id) DO UPDATE SET final_quantity=excluded.final_quantity,plaza_quantity=excluded.plaza_quantity`,[d.orderId,product,finals.get(product)??0,base.get(product)??0]);
  await c.query(`INSERT INTO audit_events(user_id,branch_id,action,previous_value,new_value) VALUES($1,$2,'FULL_FINAL_COUNT_SAVED',$3::jsonb,$4::jsonb)`,[u.id,branch,JSON.stringify(before),JSON.stringify({...d,revision,total,plaza})]);
  return {revision,total};
 });
}
export async function finalRegistrationDetail(u:SessionUser,id:string,side:'origin'|'destination'){
 await requireSystemRegistration(u);return withTransaction(async c=>{const f=await readFinalCount(c,id);if(!f||f.stale)throw Error('Actualiza el conteo final: cambió la cantidad de Plaza.');await assertBranchAccess(u,f.branch_id);const lines=finalAdjustment(f.lines,side);if(!lines.length)throw Error('No hay ajuste pendiente.');return {lines:lines.map(l=>({product_id:l.product_id,product:l.product,quantity:l.quantity})),revision:fingerprint(f.revision,f.lines)};});
}
export async function confirmFinalRegistration(u:SessionUser,id:string,side:'origin'|'destination',revision?:string){
 await requireSystemRegistration(u);return withTransaction(async c=>{
  await c.query('SELECT id FROM full_orders WHERE id=$1 FOR UPDATE',[id]);
  const f=await readFinalCount(c,id);if(!f||f.stale)throw Error('Actualiza el conteo final: cambió Plaza.');await assertBranchAccess(u,f.branch_id);
  if(!revision||revision!==fingerprint(f.revision,f.lines))throw Error('El ajuste cambió. Vuelve a abrir el detalle.');
  const lines=finalAdjustment(f.lines,side);if(!lines.length)throw Error('Este ajuste ya no está pendiente.');
  for(const l of lines)await c.query('UPDATE full_final_count_lines SET registered_delta=final_quantity-plaza_quantity WHERE order_id=$1 AND product_id=$2',[id,l.product_id]);
  await c.query(`INSERT INTO audit_events(user_id,branch_id,action,previous_value,new_value) VALUES($1,$2,'FULL_ADJUSTMENT_REGISTERED',$3::jsonb,$4::jsonb)`,[u.id,f.branch_id,JSON.stringify(f),JSON.stringify({orderId:id,revision:f.revision,side,lines})]);
 });
}
