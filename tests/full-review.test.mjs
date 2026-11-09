import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import vm from'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(path,mocks){const m={exports:{}};const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Set,Date,JSON})(n=>n==='server-only'?{}:mocks[n]??require(n),m,m.exports);return m.exports;}
function fixture({permission=true,allowed=[id(2)],status='CLOSED',reviewed=false,version=1}={}){
 const state={quantity:100,reviewed,reviewLines:[],allocations:[],mutations:0},queries=[];
 const c={query:async(sql,args=[])=>{
  queries.push({sql,args});let rows=[];
  if(sql.startsWith('SELECT id::text FROM branches'))rows=[{id:args[0]==='Treviño'?id(2):id(1)}];
  else if(sql.startsWith('SELECT x.order_id'))rows=[{order_id:id(3),branch_id:id(1),status,current_version:version}];
  else if(sql.startsWith('SELECT 1 FROM full_exit_reviews'))rows=state.reviewed?[{}]:[];
  else if(sql.startsWith('SELECT id::text,product_id'))rows=state.quantity?[{id:id(4),product_id:id(5),quantity:state.quantity}]:[];
  else if(sql.startsWith('INSERT INTO full_exit_reviews')){state.reviewed=true;rows=[{id:id(6)}];}
  else if(sql.startsWith('INSERT INTO full_review_lines'))state.reviewLines.push({id:id(7),sent:args[3],accepted:args[4],holding_branch_id:id(2),movement_id:id(8),detail:args[5]});
  else if(sql.startsWith('UPDATE exit_lines'))state.quantity=args[0];
  else if(sql.startsWith('DELETE FROM exit_lines'))state.quantity=0;
  else if(sql.startsWith('SELECT l.id::text,l.sent'))rows=state.reviewLines.filter(l=>args[0].includes(l.id));
  else if(sql.startsWith('SELECT COALESCE(sum(quantity)'))rows=[{n:state.allocations.filter(l=>l.review_line_id===args[0]).reduce((n,l)=>n+l.quantity,0)}];
  else if(sql.startsWith('INSERT INTO full_return_batches'))rows=[{id:id(9)}];
  else if(sql.startsWith('INSERT INTO full_return_batch_lines'))state.allocations.push({id:id(10+state.allocations.length),batch_id:args[0],review_line_id:args[1],quantity:args[2],received:0});
  else if(sql.startsWith('SELECT b.id::text,b.quantity'))rows=state.allocations.filter(l=>args[0].includes(l.id));
  else if(sql.startsWith('UPDATE full_return_batch_lines'))state.allocations.find(l=>l.id===args[1]).received+=args[0];
  else if(sql.startsWith('SELECT id FROM full_orders')||sql.startsWith('SELECT id FROM products')||sql.startsWith('SELECT o.id FROM full_orders'))rows=[{id:id(3)}];
  else if(sql.startsWith('SELECT movement_id::text'))rows=[{movement_id:id(20)}];
  else if(sql.startsWith('INSERT INTO exit_lines'))state.quantity+=args[2];
  else if(sql.startsWith('INSERT INTO audit_events')||sql.startsWith('INSERT INTO full_return_receipts')){}
  else throw Error('Unhandled test SQL: '+sql);
  return{rows,rowCount:rows.length};
 }};
 const mod=load('lib/inventory/full-review.ts',{'@/lib/db':{withTransaction:fn=>fn(c)},'@/lib/auth/authorization':{assertBranchAccess:async(u,b)=>{if(u.role!=='MASTER'&&!allowed.includes(b))throw Error('FORBIDDEN_BRANCH');},getAuthorizedBranchIds:async()=>allowed},'./full-orders':{requireFullAccess:async()=>{if(!permission)throw Error('NO_MODULE');}},'./full-workflow-request':{runFullWorkflow:async(u,token,action,data,fn)=>fn(c)},'./exits':{mutateReviewedFullExit:async(c,u,id,fn)=>{await fn();state.mutations++;}}});
 return{...mod,state,queries,user:{id:id(30),role:'OPERATIVE'}};
}
const review={movementId:id(8),version:1,lines:[{id:id(4),sent:100,accepted:80,detail:'20 de modelo equivocado, negro'}]};
test('100 received: retain original 100, accept 80, separate 20 and use correction snapshots',async()=>{const f=fixture();await f.reviewFullShipment(f.user,review,id(99));assert.equal(f.state.quantity,80);assert.equal(f.state.reviewLines[0].sent,100);assert.equal(f.state.reviewLines[0].accepted,80);assert.equal(f.state.mutations,1);assert.match(f.queries.find(q=>q.sql.startsWith('SELECT x.order_id')).sql,/FOR UPDATE OF m/);});
test('correct shipment does not create a pointless POS correction',async()=>{const f=fixture();await f.reviewFullShipment(f.user,{...review,lines:[{...review.lines[0],accepted:100,detail:''}]},id(99));assert.equal(f.state.quantity,100);assert.equal(f.state.mutations,0);});
test('zero accepted is distinct from unknown and all 100 remain traceable for return',async()=>{const f=fixture();await f.reviewFullShipment(f.user,{...review,lines:[{...review.lines[0],accepted:0}]},id(99));assert.equal(f.state.quantity,0);assert.equal(f.state.reviewLines[0].sent-f.state.reviewLines[0].accepted,100);});
test('stale, duplicate, unshipped, wrong branch and invalid review payloads are rejected before mutation',async()=>{
 for(const opts of[{version:2},{status:'DRAFT'},{status:'CANCELLED'},{reviewed:true},{allowed:[id(1)]},{permission:false}]){const f=fixture(opts);await assert.rejects(f.reviewFullShipment(f.user,review,id(99)));assert.equal(f.state.mutations,0);}
 for(const lines of[[],[review.lines[0],review.lines[0]],[{...review.lines[0],accepted:101}],[{...review.lines[0],accepted:80,detail:''}],[{...review.lines[0],sent:90}],[{...review.lines[0],accepted:1.5}],[{...review.lines[0],accepted:-1}]]){const f=fixture();await assert.rejects(f.reviewFullShipment(f.user,{...review,lines},id(99)));assert.equal(f.state.reviewLines.length,0);}
});
test('batch supports partial allocation and rejects sending the same 20 twice',async()=>{const f=fixture();await f.reviewFullShipment(f.user,review,id(99));await f.sendFullReturns(f.user,{items:[{id:id(7),quantity:15}]},id(98));assert.equal(f.state.allocations[0].quantity,15);await assert.rejects(f.sendFullReturns(f.user,{items:[{id:id(7),quantity:6}]},id(97)));await f.sendFullReturns(f.user,{items:[{id:id(7),quantity:5}]},id(96));assert.equal(f.state.allocations.reduce((n,l)=>n+l.quantity,0),20);assert.match(f.queries.find(q=>q.sql.startsWith('SELECT l.id::text,l.sent')).sql,/ORDER BY l.id FOR UPDATE OF l/);});
test('only Plaza confirms returns, partial receipts remain in transit and cannot exceed sent',async()=>{const f=fixture({allowed:[id(1),id(2)]});await f.reviewFullShipment(f.user,review,id(99));await f.sendFullReturns(f.user,{items:[{id:id(7),quantity:20}]},id(98));await f.receiveFullReturns(f.user,{items:[{id:id(10),quantity:8}]},id(97));assert.equal(f.state.allocations[0].received,8);await assert.rejects(f.receiveFullReturns(f.user,{items:[{id:id(10),quantity:13}]},id(96)));await f.receiveFullReturns(f.user,{items:[{id:id(10),quantity:12}]},id(95));assert.equal(f.state.allocations[0].received,20);const denied=fixture();await assert.rejects(denied.receiveFullReturns(denied.user,{items:[{id:id(10),quantity:1}]},id(99)));});
test('Treviño compensation uses its existing exit, never creates a second movement',async()=>{const f=fixture();await f.contributeToFull(f.user,{orderId:id(3),productId:id(5),quantity:20},id(99));const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO exit_lines'));assert.deepEqual(JSON.parse(JSON.stringify(insert.args)),[id(20),id(5),20]);assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT INTO inventory_movements')),false);});
test('replay uses a transaction lock, returns cached result and rejects a mismatched request',async()=>{let calls=0;const queries=[],c={query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.startsWith('SELECT result')?[{result:'batch',matches:true}]:[]};}};const {runFullWorkflow}=load('lib/inventory/full-workflow-request.ts',{'@/lib/db':{withTransaction:fn=>fn(c)}});assert.equal(await runFullWorkflow({id:id(30)},id(99),'send',{},async()=>{calls++;}),'batch');assert.equal(calls,0);assert.match(queries[0].sql,/pg_advisory_xact_lock/);const d=load('lib/inventory/full-workflow-request.ts',{'@/lib/db':{withTransaction:fn=>fn({query:async sql=>({rows:sql.startsWith('SELECT result')?[{matches:false}]:[]})})}});await assert.rejects(d.runFullWorkflow({id:id(30)},id(99),'send',{},async()=>{}));});
test('routes authenticate, audit, and keep return allocations and receipts separate from inventory changes',()=>{const service=read('lib/inventory/full-review.ts'),api=read('app/api/full-workflow/route.ts');assert.match(api,/POST=auditRoute\(handle\)/);assert.match(api,/requireUser\(\)/);const returnCode=service.slice(service.indexOf('export async function sendFullReturns'),service.indexOf('const contributeSchema'));assert.doesNotMatch(returnCode,/INSERT INTO inventory_movements|INSERT INTO exit_lines|pos_registration_events/);assert.match(service,/a.received<a.quantity/);assert.match(service,/r.source_branch_id=ANY/);assert.match(service,/r.holding_branch_id=ANY/);assert.match(read('lib/inventory/exits.ts'),/FULL_REVIEW_CORRECTION/);assert.match(read('app/(app)/salidas/pedidos/workflow-controls.tsx'),/crypto.randomUUID/);});
test('actual exit correction helper preserves snapshots and sets POS review only when previously registered',async()=>{
 for(const status of ['DRAFT','CLOSED','POS_REGISTERED']){
  let quantity=100,version=1;const queries=[];
  const c={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT id::text,branch_id'))return{rows:[{id:id(8),branch_id:id(1),status,current_version:version,pos_registered_at:status==='POS_REGISTERED'?'today':null}]};if(sql.startsWith('SELECT jsonb_build_object'))return{rows:[{snapshot:{quantity},total:quantity}]};if(sql.startsWith('UPDATE inventory_movements'))return{rows:[{current_version:++version}]};return{rows:[]};}};
  const mod=load('lib/inventory/exits.ts',{'@/lib/auth/special-permissions':{requireSystemRegistration:async()=>{}},'@/lib/db':{},'@/lib/auth/authorization':{},'./policy':load('lib/inventory/policy.ts',{})});
  await mod.mutateReviewedFullExit(c,{id:id(30)},id(8),async()=>{quantity=80;});
  const change=queries.find(q=>q.sql.startsWith('INSERT INTO movement_change_sets'));
  if(status==='DRAFT'){assert.equal(change,undefined);assert.equal(version,1);}else{assert.equal(change.args[3],100);assert.equal(change.args[4],80);assert.equal(change.args[5],-20);assert.match(queries.find(q=>q.sql.startsWith('UPDATE inventory_movements')).sql,/WHEN pos_registered_at IS NULL THEN status ELSE 'POS_CORRECTION_PENDING'/);}
 }
});
test('only MASTER can adjust FULL reference total without changing its lines or branch exits',async()=>{const f=fixture();await assert.rejects(f.adjustFullTarget(f.user,{orderId:id(3),expectedPieces:80,previousExpected:100,reason:'No hay reposición'},id(99)));assert.equal(f.queries.length,0);const source=read('lib/inventory/full-review.ts').slice(read('lib/inventory/full-review.ts').indexOf('const targetSchema'));assert.match(source,/UPDATE full_orders SET expected_pieces=\$1 WHERE id=\$2/);assert.doesNotMatch(source,/UPDATE exit_lines|INSERT INTO inventory_movements/);});
