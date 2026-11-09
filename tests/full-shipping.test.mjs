import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function load(path,mocks){const m={exports:{}};const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Date,JSON})(n=>n==='server-only'?{}:mocks[n]??require(n),m,m.exports);return m.exports;}
function fixture({permission=true,allowed=true,shipped=false,status='DRAFT',lines=false,registered=false,expected=80,parts}={}){
 const queries=[],state={shipped,waived:false,status};
 const c={query:async(sql,args)=>{queries.push({sql,args});let rows=[];
  if(sql.startsWith('SELECT shipped_at'))rows=[{shipped_at:state.shipped?'now':null,expected_pieces:expected}];
  else if(sql.startsWith('SELECT id::text FROM branches'))rows=[{id:id(2)}];
  else if(sql.startsWith('SELECT m.branch_id'))rows=[{branch_id:id(2),status:state.status,pos_registered_at:registered?'now':null,waived_at:state.waived?'now':null}];
  else if(sql.startsWith('SELECT 1 FROM exit_lines'))rows=lines?[{id:id(9)}]:[];
  else if(sql.startsWith('SELECT m.id::text movement_id'))rows=parts??[{movement_id:id(4),branch_id:id(1),branch:'Plaza del Audio',status:'CLOSED',waived_at:null,pieces:80,reviewed:true},{movement_id:id(5),branch_id:id(2),branch:'Treviño',status:'CANCELLED',waived_at:'now',pieces:0,reviewed:false}];
  else if(sql.startsWith('UPDATE full_order_exits'))state.waived=true;
  else if(sql.startsWith('UPDATE inventory_movements'))state.status='CANCELLED';
  else if(sql.startsWith('UPDATE full_orders'))state.shipped=true;
  else if(!sql.startsWith('INSERT INTO audit_events'))throw Error('Unknown SQL '+sql);
  return {rows,rowCount:rows.length};
 }};
 const mod=load('lib/inventory/full-shipping.ts',{'@/lib/auth/authorization':{assertBranchAccess:async()=>{if(!allowed)throw Error('FORBIDDEN_BRANCH');}},'./full-orders':{requireFullAccess:async()=>{if(!permission)throw Error('NO_MODULE');}},'./full-workflow-request':{runFullWorkflow:async(u,r,a,d,fn)=>fn(c)}});
 return {...mod,queries,state,user:{id:id(10),role:'OPERATIVE'}};
}
const body={orderId:id(3),movementId:id(5)};
test('empty branch can opt out, audited without stock or POS writes',async()=>{const f=fixture();await f.waiveFullContribution(f.user,body,id(99));assert.equal(f.state.waived,true);assert.equal(f.state.status,'CANCELLED');assert.ok(f.queries.some(q=>q.sql.includes('FULL_NO_CONTRIBUTION')));assert.ok(!f.queries.some(q=>/exit_lines.*(SET|VALUES)|pos_registration_events/.test(q.sql)));});
test('opt out rejects captured, registered, closed, shipped, wrong branch and missing module',async()=>{for(const opts of [{lines:true},{registered:true},{status:'CLOSED'},{shipped:true},{allowed:false},{permission:false}]){const f=fixture(opts);await assert.rejects(f.waiveFullContribution(f.user,body,id(99)));assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE')));}});
test('100% Plaza can ship while POS registration remains pending',async()=>{const f=fixture();await f.closeFullShipment(f.user,{orderId:id(3)},id(99));assert.equal(f.state.shipped,true);assert.ok(f.queries.some(q=>q.sql.includes('FULL_SHIPPED')));assert.ok(!f.queries.some(q=>/UPDATE inventory_movements|exit_lines SET|pos_registration_events/.test(q.sql)));});
test('shipping rejects unfinished, unreviewed, cancelled, empty and mismatched FULLs',async()=>{
 const part={movement_id:id(4),branch_id:id(1),branch:'Plaza del Audio',status:'CLOSED',pieces:80,reviewed:true};
 for(const opts of [{parts:[{...part,status:'DRAFT'}]},{parts:[{...part,reviewed:false}]},{parts:[{...part,status:'CANCELLED'}]},{parts:[{...part,pieces:0}],expected:null},{expected:100},{parts:[]},{allowed:false},{permission:false}]){const f=fixture(opts);await assert.rejects(f.closeFullShipment(f.user,{orderId:id(3)},id(99)));assert.equal(f.state.shipped,false);}
});
test('shipping twice does not duplicate audit or movement writes',async()=>{const f=fixture();await f.closeFullShipment(f.user,{orderId:id(3)},id(99));const n=f.queries.filter(q=>q.sql.startsWith('UPDATE')).length;await f.closeFullShipment(f.user,{orderId:id(3)},id(100));assert.equal(f.queries.filter(q=>q.sql.startsWith('UPDATE')).length,n);});
test('shipped FULL locks content but permits POS-only writes',async()=>{let locks=0;const c={query:async()=>{locks++;return {rows:[{shipped_at:'now'}]};}};const m=load('lib/inventory/full-shipping-lock.ts',{});await assert.rejects(m.lockFullForMovement(c,id(1)));await m.lockFullForMovement(c,id(1),false);await assert.rejects(m.assertFullOpen(c,id(3)));assert.equal(locks,3);});
test('UI exposes compact actions, history and server authentication',()=>{const api=read('app/api/full-workflow/route.ts');assert.match(api,/requireUser/);assert.match(api,/waive:waiveFullContribution,ship:closeFullShipment/);assert.match(read('app/(app)/salidas/pedidos/workflow-controls.tsx'),/Sin aportación/);assert.match(read('app/(app)/salidas/pedidos/page.tsx'),/view=history/);assert.match(read('lib/inventory/full-orders.ts'),/f.shipped_at IS NOT NULL/);assert.match(read('lib/inventory/exits.ts'),/lock\(c,u,id,false\)/);});
