import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from '@neondatabase/serverless';
import {withTransaction} from '@/lib/db';
import {assertBranchAccess,getAuthorizedBranchIds} from '@/lib/auth/authorization';
import type {SessionUser} from '@/lib/auth/types';
import {requireFullAccess} from './full-orders';
import {runFullWorkflow} from './full-workflow-request';
import {mutateReviewedFullExit} from './exits';
import {assertFullOpen,lockFullForMovement} from './full-shipping-lock';
const uuid=z.string().uuid(),qty=z.number().int().min(1).max(10000000);
async function branch(c:PoolClient,user:SessionUser,name:string){
 const q=await c.query<{id:string}>(`SELECT id::text FROM branches WHERE name=$1 AND status::text='ACTIVE'`,[name]);
 if(q.rows.length!==1)throw Error('Sucursal no disponible.');await assertBranchAccess(user,q.rows[0].id);return q.rows[0].id;
}
async function audit(c:PoolClient,u:SessionUser,b:string,m:string|null,action:string,value:unknown){await c.query(`INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,$4,$5::jsonb)`,[u.id,b,m,action,JSON.stringify(value)]);}
const reviewSchema=z.object({movementId:uuid,version:z.number().int().positive(),lines:z.array(z.object({id:uuid,sent:qty,accepted:z.number().int().min(0),detail:z.string().trim().max(500)}).strict()).min(1).max(500)}).strict();
export async function reviewFullShipment(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=reviewSchema.parse(raw);
 return runFullWorkflow(u,requestId,'review',data,async c=>{
  const holding=await branch(c,u,'Treviño');
  await lockFullForMovement(c,data.movementId);
  const q=await c.query<{order_id:string;branch_id:string;status:string;current_version:number}>(`SELECT x.order_id::text,m.branch_id::text,m.status::text,m.current_version FROM inventory_movements m JOIN full_order_exits x ON x.movement_id=m.id AND x.branch_id=m.branch_id JOIN branches b ON b.id=m.branch_id WHERE m.id=$1 AND m.movement_type='EXIT' AND b.name='Plaza del Audio' FOR UPDATE OF m`,[data.movementId]);
  const m=q.rows[0];if(!m||!['CLOSED','PENDING_POS','POS_REGISTERED','POS_RECONCILED','POS_CORRECTION_PENDING'].includes(m.status))throw Error('Plaza debe cerrar la captura antes de revisar.');
  if(m.current_version!==data.version)throw Error('La salida cambió. Recarga antes de revisar.');
  if((await c.query('SELECT 1 FROM full_exit_reviews WHERE movement_id=$1',[data.movementId])).rows.length)throw Error('Esta salida ya fue revisada.');
  const lines=await c.query<{id:string;product_id:string;quantity:number}>('SELECT id::text,product_id::text,quantity FROM exit_lines WHERE movement_id=$1 ORDER BY id FOR UPDATE',[data.movementId]);
  if(lines.rows.length!==data.lines.length||new Set(data.lines.map(l=>l.id)).size!==data.lines.length)throw Error('Revisa todas las partidas sin repetirlas.');
  for(const l of lines.rows){const v=data.lines.find(v=>v.id===l.id);if(!v||v.sent!==l.quantity||v.accepted>l.quantity||v.accepted<l.quantity&&!v.detail)throw Error('Cantidades o motivo incorrectos. Recarga la salida.');}
  const review=await c.query<{id:string}>(`INSERT INTO full_exit_reviews(movement_id,order_id,source_branch_id,holding_branch_id,reviewed_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text`,[data.movementId,m.order_id,m.branch_id,holding,u.id]);
  const change=async()=>{
   for(const l of lines.rows){const v=data.lines.find(v=>v.id===l.id)!;await c.query(`INSERT INTO full_review_lines(review_id,original_line_id,product_id,sent,accepted,detail) VALUES($1,$2,$3,$4,$5,$6)`,[review.rows[0].id,l.id,l.product_id,l.quantity,v.accepted,v.detail]);
    if(v.accepted===0)await c.query('DELETE FROM exit_lines WHERE id=$1 AND movement_id=$2',[l.id,data.movementId]);else if(v.accepted!==l.quantity)await c.query('UPDATE exit_lines SET quantity=$1 WHERE id=$2 AND movement_id=$3',[v.accepted,l.id,data.movementId]);
   }
  };
  if(data.lines.some(l=>l.accepted<l.sent))await mutateReviewedFullExit(c,u,data.movementId,change);else await change();
  await audit(c,u,holding,data.movementId,'FULL_SHIPMENT_REVIEWED',{reviewId:review.rows[0].id,orderId:m.order_id,lines:data.lines});
 });
}
const allocation=z.object({id:uuid,quantity:qty}).strict();
const batchSchema=z.object({items:z.array(allocation).min(1).max(200)}).strict();
export async function sendFullReturns(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=batchSchema.parse(raw);if(new Set(data.items.map(i=>i.id)).size!==data.items.length)throw Error('Partida repetida.');
 return runFullWorkflow(u,requestId,'send',data,async c=>{
  const holding=await branch(c,u,'Treviño');
  const items=await c.query<{id:string;sent:number;accepted:number;holding_branch_id:string;movement_id:string}>(`SELECT l.id::text,l.sent,l.accepted,r.holding_branch_id::text,r.movement_id::text FROM full_review_lines l JOIN full_exit_reviews r ON r.id=l.review_id JOIN branches b ON b.id=r.source_branch_id WHERE l.id=ANY($1::uuid[]) AND r.holding_branch_id=$2 AND b.name='Plaza del Audio' ORDER BY l.id FOR UPDATE OF l`,[data.items.map(i=>i.id),holding]);
  if(items.rows.length!==data.items.length)throw Error('Partida no disponible.');
  for(const item of items.rows){const allocated=await c.query<{n:number}>('SELECT COALESCE(sum(quantity),0)::int n FROM full_return_batch_lines WHERE review_line_id=$1',[item.id]);if(data.items.find(i=>i.id===item.id)!.quantity>item.sent-item.accepted-allocated.rows[0].n)throw Error('La cantidad ya se envió o supera lo pendiente.');}
  const folio='DEV-FULL-'+Date.now()+'-'+randomUUID().slice(0,6).toUpperCase();
  const batch=await c.query<{id:string}>('INSERT INTO full_return_batches(folio,created_by) VALUES($1,$2) RETURNING id::text',[folio,u.id]);
  for(const item of items.rows)await c.query('INSERT INTO full_return_batch_lines(batch_id,review_line_id,quantity) VALUES($1,$2,$3)',[batch.rows[0].id,item.id,data.items.find(i=>i.id===item.id)!.quantity]);
  await audit(c,u,holding,null,'FULL_RETURN_BATCH_SENT',{batchId:batch.rows[0].id,folio,items:data.items});return batch.rows[0].id;
 });
}
export async function receiveFullReturns(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=batchSchema.parse(raw);if(new Set(data.items.map(i=>i.id)).size!==data.items.length)throw Error('Partida repetida.');
 return runFullWorkflow(u,requestId,'receive',data,async c=>{
  const plaza=await branch(c,u,'Plaza del Audio');
  const lines=await c.query<{id:string;quantity:number;received:number}>(`SELECT b.id::text,b.quantity,b.received FROM full_return_batch_lines b JOIN full_review_lines l ON l.id=b.review_line_id JOIN full_exit_reviews r ON r.id=l.review_id WHERE b.id=ANY($1::uuid[]) AND r.source_branch_id=$2 ORDER BY b.id FOR UPDATE OF b`,[data.items.map(i=>i.id),plaza]);
  if(lines.rows.length!==data.items.length)throw Error('Devolución no disponible.');
  for(const l of lines.rows){const amount=data.items.find(i=>i.id===l.id)!.quantity;if(amount>l.quantity-l.received)throw Error('La cantidad supera lo pendiente de recibir.');await c.query('UPDATE full_return_batch_lines SET received=received+$1 WHERE id=$2',[amount,l.id]);await c.query('INSERT INTO full_return_receipts(batch_line_id,quantity,received_by) VALUES($1,$2,$3)',[l.id,amount,u.id]);}
  await audit(c,u,plaza,null,'FULL_RETURN_RECEIVED',data);
 });
}
const contributeSchema=z.object({orderId:uuid,productId:uuid,quantity:qty}).strict();
export async function contributeToFull(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);const data=contributeSchema.parse(raw);
 return runFullWorkflow(u,requestId,'contribute',data,async c=>{
  const trevino=await branch(c,u,'Treviño');
  // Serialize branch creation with other FULL contributions, not a second exit.
  await assertFullOpen(c,data.orderId);
  if(!(await c.query("SELECT id FROM products WHERE id=$1 AND status::text='ACTIVE'",[data.productId])).rows.length)throw Error('Producto no disponible.');
  let exits=await c.query<{movement_id:string}>('SELECT movement_id::text FROM full_order_exits WHERE order_id=$1 AND branch_id=$2',[data.orderId,trevino]);
  if(!exits.rows.length){const m=await c.query<{id:string}>(`INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by) VALUES($1,'EXIT',$2,$3) RETURNING id::text`,['SAL-'+Date.now()+'-'+randomUUID().slice(0,8).toUpperCase(),trevino,u.id]);await c.query("INSERT INTO exits(movement_id,channel,exit_type) VALUES($1,'MERCADO_LIBRE','FULL')",[m.rows[0].id]);await c.query('INSERT INTO full_order_exits(order_id,branch_id,movement_id) VALUES($1,$2,$3)',[data.orderId,trevino,m.rows[0].id]);exits={...exits,rows:[{movement_id:m.rows[0].id}]};}
  const waived=await c.query('SELECT waived_at FROM full_order_exits WHERE movement_id=$1',[exits.rows[0].movement_id]);
  if(waived.rows[0]?.waived_at){await c.query("UPDATE inventory_movements SET status='DRAFT',updated_at=now() WHERE id=$1",[exits.rows[0].movement_id]);await c.query('UPDATE full_order_exits SET waived_at=NULL,waived_by=NULL WHERE movement_id=$1',[exits.rows[0].movement_id]);}
  await mutateReviewedFullExit(c,u,exits.rows[0].movement_id,async()=>{await c.query('INSERT INTO exit_lines(movement_id,product_id,quantity) VALUES($1,$2,$3)',[exits.rows[0].movement_id,data.productId,data.quantity]);});
  await audit(c,u,trevino,exits.rows[0].movement_id,'FULL_TREVINO_CONTRIBUTION',data);
 });
}
export type ReviewLine={id:string;product:string;quantity:number};
export async function fullReviewData(u:SessionUser,orderId:string){
 await requireFullAccess(u);uuid.parse(orderId);const ids=await getAuthorizedBranchIds(u);
 return withTransaction(async c=>{
  const b=await c.query<{id:string;name:string}>(`SELECT id::text,name FROM branches WHERE name IN ('Treviño','Plaza del Audio') AND status::text='ACTIVE'`);
  const canReview=b.rows.some(b=>b.name==='Treviño'&&(ids===null||ids.includes(b.id)));
  if(!b.rows.some(b=>ids===null||ids.includes(b.id)))throw Error('Sin acceso a sucursal.');
  const order=await c.query<{shipped_at:string|null}>('SELECT shipped_at FROM full_orders WHERE id=$1',[orderId]);
  const shipment=canReview?await c.query<{id:string;current_version:number;status:string;reviewed:boolean}>(`SELECT m.id::text,m.current_version,m.status::text,EXISTS(SELECT 1 FROM full_exit_reviews r WHERE r.movement_id=m.id) reviewed FROM full_order_exits x JOIN inventory_movements m ON m.id=x.movement_id JOIN branches b ON b.id=x.branch_id WHERE x.order_id=$1 AND b.name='Plaza del Audio' AND m.status::text<>'CANCELLED'`,[orderId]):{rows:[]};
  const s=shipment.rows[0];const lines=s?await c.query<ReviewLine>(`SELECT l.id::text,p.name product,l.quantity FROM exit_lines l JOIN products p ON p.id=l.product_id WHERE l.movement_id=$1 ORDER BY l.created_at`,[s.id]):{rows:[]};
  const summary=await c.query<{sent:number;accepted:number;rejected:number}>(`SELECT COALESCE(sum(l.sent),0)::int sent,COALESCE(sum(l.accepted),0)::int accepted,COALESCE(sum(l.sent-l.accepted),0)::int rejected FROM full_exit_reviews r JOIN full_review_lines l ON l.review_id=r.id WHERE r.order_id=$1 AND ($2::uuid[] IS NULL OR r.source_branch_id=ANY($2::uuid[]) OR r.holding_branch_id=ANY($2::uuid[]))`,[orderId,ids]);
  const products=canReview?await c.query<{id:string;name:string}>("SELECT id::text,name FROM products WHERE status::text='ACTIVE' ORDER BY name"):{rows:[]};
  return{canReview,shippedAt:order.rows[0]?.shipped_at??null,shipment:s??null,lines:lines.rows,summary:summary.rows[0],products:products.rows};
 });
}
export async function fullReturnData(u:SessionUser){
 await requireFullAccess(u);const ids=await getAuthorizedBranchIds(u);
 return withTransaction(async c=>{
  const b=await c.query<{id:string;name:string}>(`SELECT id::text,name FROM branches WHERE name IN ('Treviño','Plaza del Audio') AND status::text='ACTIVE'`);
  const canSend=b.rows.some(b=>b.name==='Treviño'&&(ids===null||ids.includes(b.id))),canReceive=b.rows.some(b=>b.name==='Plaza del Audio'&&(ids===null||ids.includes(b.id)));
  if(!canSend&&!canReceive)throw Error('Sin acceso a estas devoluciones.');
  const pending=await c.query<{id:string;reference:string;product:string;detail:string;pending:number}>(`SELECT l.id::text,o.reference,p.name product,l.detail,(l.sent-l.accepted-COALESCE(a.n,0))::int pending FROM full_review_lines l JOIN full_exit_reviews r ON r.id=l.review_id JOIN full_orders o ON o.id=r.order_id JOIN products p ON p.id=l.product_id LEFT JOIN LATERAL(SELECT sum(quantity) n FROM full_return_batch_lines a WHERE a.review_line_id=l.id) a ON true WHERE l.sent-l.accepted>COALESCE(a.n,0) AND ($1::uuid[] IS NULL OR r.source_branch_id=ANY($1::uuid[]) OR r.holding_branch_id=ANY($1::uuid[])) ORDER BY r.created_at,l.id LIMIT 500`,[ids]);
  const shipped=await c.query<{id:string;batch_id:string;folio:string;reference:string;product:string;detail:string;quantity:number;received:number}>(`SELECT a.id::text,a.batch_id::text,b.folio,o.reference,p.name product,l.detail,a.quantity,a.received FROM full_return_batch_lines a JOIN full_return_batches b ON b.id=a.batch_id JOIN full_review_lines l ON l.id=a.review_line_id JOIN full_exit_reviews r ON r.id=l.review_id JOIN full_orders o ON o.id=r.order_id JOIN products p ON p.id=l.product_id WHERE a.received<a.quantity AND ($1::uuid[] IS NULL OR r.source_branch_id=ANY($1::uuid[]) OR r.holding_branch_id=ANY($1::uuid[])) ORDER BY b.created_at DESC,a.id LIMIT 500`,[ids]);
  const history=await c.query<{folio:string;quantity:number;received:number;parts:{reference:string;product:string;detail:string;received:number}[]}>(`SELECT b.folio,sum(a.quantity)::int quantity,sum(a.received)::int received,jsonb_agg(jsonb_build_object('reference',o.reference,'product',p.name,'detail',l.detail,'received',a.received) ORDER BY o.reference,l.id) parts FROM full_return_batches b JOIN full_return_batch_lines a ON a.batch_id=b.id JOIN full_review_lines l ON l.id=a.review_line_id JOIN full_exit_reviews r ON r.id=l.review_id JOIN full_orders o ON o.id=r.order_id JOIN products p ON p.id=l.product_id WHERE ($1::uuid[] IS NULL OR r.source_branch_id=ANY($1::uuid[]) OR r.holding_branch_id=ANY($1::uuid[])) GROUP BY b.id,b.folio,b.created_at HAVING sum(a.quantity)=sum(a.received) ORDER BY b.created_at DESC LIMIT 30`,[ids]);
  return{canSend,canReceive,pending:pending.rows,shipped:shipped.rows,history:history.rows};
 });
}
export async function fullReviewQueue(u:SessionUser){
 await requireFullAccess(u);return withTransaction(async c=>{
  await branch(c,u,'Treviño');return(await c.query<{id:string;reference:string;title:string}>(`SELECT o.id::text,o.reference,o.title FROM full_orders o JOIN full_order_exits x ON x.order_id=o.id JOIN inventory_movements m ON m.id=x.movement_id JOIN branches b ON b.id=x.branch_id WHERE o.shipped_at IS NULL AND b.name='Plaza del Audio' AND m.status::text IN ('CLOSED','PENDING_POS','POS_REGISTERED','POS_RECONCILED','POS_CORRECTION_PENDING') AND NOT EXISTS(SELECT 1 FROM full_exit_reviews r WHERE r.movement_id=m.id) ORDER BY o.created_at LIMIT 100`)).rows;
 });
}
const targetSchema=z.object({orderId:uuid,expectedPieces:qty.nullable(),previousExpected:qty.nullable(),reason:z.string().trim().min(1).max(500)}).strict();
export async function adjustFullTarget(u:SessionUser,raw:unknown,requestId:string){
 await requireFullAccess(u);if(u.role!=='MASTER')throw Error('Solo MASTER puede ajustar el total del pedido.');const data=targetSchema.parse(raw);
 return runFullWorkflow(u,requestId,'target',data,async c=>{
  await assertFullOpen(c,data.orderId);
  const order=await c.query<{expected_pieces:number|null}>('SELECT expected_pieces FROM full_orders WHERE id=$1 FOR UPDATE',[data.orderId]);
  if(!order.rows.length||order.rows[0].expected_pieces!==data.previousExpected)throw Error('El pedido cambió. Recarga antes de ajustar.');
  await c.query('UPDATE full_orders SET expected_pieces=$1 WHERE id=$2',[data.expectedPieces,data.orderId]);
  const links=await c.query<{branch_id:string;movement_id:string}>('SELECT branch_id::text,movement_id::text FROM full_order_exits WHERE order_id=$1',[data.orderId]);
  for(const l of links.rows)await audit(c,u,l.branch_id,l.movement_id,'FULL_TARGET_ADJUSTED',data);
 });
}
