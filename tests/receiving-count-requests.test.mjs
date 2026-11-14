import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const order='00000000-0000-4000-8000-000000000001',person='00000000-0000-4000-8000-000000000002',branch='00000000-0000-4000-8000-000000000003';
test('receipt home renders a prominent count-permissions link only for its verified owner',async()=>{
 const {renderToStaticMarkup}=require('react-dom/server');
 for(const [id,visible] of [['6373f0fc-68dc-405c-a26e-00e6594031ca',true],[person,false]]){
  const mod={exports:{}},mocks={'next/link':({children,...props})=>require('react').createElement('a',props,children),'@/lib/auth/authorization':{requireUser:async()=>({id,role:'MASTER'}),getAuthorizedBranchIds:async()=>null},'@/lib/db':{sql:async(strings)=>strings.join('').includes('receiving_count_requests')?[{n:3}]:[]},'@/lib/inventory/receiving':{receivingAccess:async()=>{}},'@/lib/inventory/receiving-overview':{receivingOverview:async()=>[]},'./receiving-new':()=>null,'./receiving-receipt-card':()=>null,'./receiving.css':{}};
  const code=ts.transpileModule(readFileSync(new URL('../app/(app)/entradas/pedidos/page.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInThisContext('(function(require,module,exports){'+code+'})')(n=>n in mocks?mocks[n]:require(n),mod,mod.exports);
  const html=renderToStaticMarkup(await mod.exports.default({}));
  assert.equal(html.includes('class="receivingCountPermissions"'),visible);
  assert.equal(html.includes('href="/entradas/permisos-conteo"'),visible);
  if(visible){assert.match(html,/3 pendientes/);assert.match(html,/receivingCountPermissionsBadge/);}
 }
 const css=readFileSync(new URL('../app/(app)/entradas/pedidos/receiving.css',import.meta.url),'utf8');assert.match(css,/\.receivingHome \.receivingCountPermissions\{[^}]*min-height:48px/);assert.match(css,/\.receivingCountPermissions:focus-visible/);
});
function fixture({access=true,open=true,changed=true,approved=true,registered=false,closed=false,arrived=false}={}){
 const queries=[];const query=async(sql,args=[])=>{queries.push({sql,args});const rows=sql.startsWith('SELECT o.id,o.marking')?[{id:order,marking:'JAPS',branch_id:branch,destination_branch_id:'00000000-0000-4000-8000-000000000004',is_foreign:true,product_id:'00000000-0000-4000-8000-000000000005'}]:sql.startsWith('SELECT id,name FROM branches')?[{id:args[0]==='Treviño'?branch:'00000000-0000-4000-8000-000000000004',name:args[0]}]:sql.startsWith('SELECT 1 FROM receiving_count_requests')?(approved?[{ok:1}]:[]):sql.startsWith('SELECT 1 FROM receiving_origin_registrations')?(registered?[{ok:1}]:[]):sql.includes("s.status<>'DRAFT'")?(closed?[{ok:1}]:[]):sql.startsWith('SELECT 1 FROM receiving_destination_arrivals')?(arrived?[{ok:1}]:[]):sql.startsWith('SELECT 1 FROM receiving_cartons')?(open?[{ok:1}]:[]):sql.startsWith('INSERT INTO receiving_count_requests')?(changed?[{order_id:order}]:[]):sql.startsWith('UPDATE receiving_count_requests')?[{status:args[2]}]:[];return {rows,rowCount:rows.length}};
 const m={exports:{}};const mocks={'server-only':{},'@/lib/db':{withTransaction:fn=>fn({query}),sql:async(strings,...args)=>(await query(strings.join('?'),args)).rows},'./receiving':{receivingAccess:async()=>{if(!access)throw Error('Sin permiso')}}};
 vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(readFileSync(new URL('../lib/inventory/receiving-count-requests.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(n=>n in mocks?mocks[n]:require(n),m,m.exports);
 return {...m.exports,queries};
}
test('requests are scoped to authenticated person and exact order, idempotent, audited and never auto-approved',async()=>{
 const f=fixture();await f.countRequestAction({id:person},{action:'request',orderId:order,userId:f.countRequestOwner});const q=f.queries.find(q=>q.sql.startsWith('INSERT INTO receiving_count_requests'));assert.deepEqual(q.args,[order,person]);assert.match(q.sql,/status='DENIED'/);assert.ok(!q.sql.includes("status='APPROVED'"));assert.ok(f.queries.some(q=>q.sql.includes('RECEIVING_COUNT_PERMISSION_REQUESTED')));
 const repeat=fixture({changed:false});await repeat.countRequestAction({id:person},{action:'request',orderId:order});assert.ok(!repeat.queries.some(q=>q.sql.startsWith('INSERT INTO audit_events')));
 for(const opts of [{open:false},{access:false}]){const f=fixture(opts);await assert.rejects(()=>f.countRequestAction({id:person},{action:'request',orderId:order}));assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT')));}
});
test('only verified owner can review, authorize or revoke; MASTER role and email cannot impersonate owner',async()=>{
 for(const action of ['approve','deny','destination']){const f=fixture();await assert.rejects(()=>f.countRequestAction({id:person,role:'MASTER',email:'alejandrop921@gmail.com'},{action,orderId:order,userId:person}),/Solo la cuenta/);assert.equal(f.queries.length,0);}
 const f=fixture();await assert.rejects(()=>f.countRequestList({id:person,role:'MASTER'}),/Sin permiso/);
 for(const action of ['approve','deny']){const f=fixture();await f.countRequestAction({id:f.countRequestOwner},{action,orderId:order,userId:person});const q=f.queries.find(q=>q.sql.startsWith('UPDATE receiving_count_requests'));assert.deepEqual(q.args,[order,person,action==='approve'?'APPROVED':'DENIED',f.countRequestOwner]);assert.ok(f.queries.some(q=>q.sql.includes('RECEIVING_COUNT_PERMISSION_DECIDED')));}
});
test('approved request lets owner choose actual destination without modifying mark, packing, counts or POS ledgers',async()=>{
 const f=fixture();await f.countRequestAction({id:f.countRequestOwner},{action:'destination',orderId:order,userId:person,destination:'Treviño',marking:'PER'});
 const update=f.queries.find(q=>q.sql.startsWith('UPDATE receiving_orders'));assert.deepEqual(update.args,[order,branch,false]);assert.equal(update.sql,'UPDATE receiving_orders SET destination_branch_id=$2,is_foreign=$3 WHERE id=$1');
 const audit=f.queries.find(q=>q.sql.includes('RECEIVING_DESTINATION_CHANGED'));assert.equal(JSON.parse(audit.args[2]).marking,'JAPS');assert.equal(JSON.parse(audit.args[3]).countsPreserved,true);assert.equal(JSON.parse(audit.args[3]).requesterId,person);
 assert.ok(!f.queries.some(q=>/^(UPDATE|DELETE FROM|INSERT INTO) receiving_(items|cartons|origin_registrations|destination_registrations)/.test(q.sql)));
 assert.ok(f.queries.findIndex(q=>q.sql.startsWith('SELECT s.id FROM receiving_sessions'))<f.queries.findIndex(q=>q.sql.startsWith('SELECT o.id,o.marking')));
 const same=fixture();await same.countRequestAction({id:same.countRequestOwner},{action:'destination',orderId:order,userId:person,destination:'Plaza del Audio'});assert.ok(!same.queries.some(q=>/^(UPDATE|INSERT)/.test(q.sql)));
});
test('destination selection is blocked before approval, after registration, closed receipt or confirmed other-branch arrival',async()=>{
 for(const opts of [{approved:false},{registered:true},{closed:true},{arrived:true}]){
  const f=fixture(opts);await assert.rejects(()=>f.countRequestAction({id:f.countRequestOwner},{action:'destination',orderId:order,userId:person,destination:'Treviño'}));assert.ok(!f.queries.some(q=>/^(UPDATE|INSERT|DELETE)/.test(q.sql)));
 }
 for(const destination of [undefined,'CDMX']){const f=fixture();await assert.rejects(()=>f.countRequestAction({id:f.countRequestOwner},{action:'destination',orderId:order,userId:person,destination}));assert.ok(!f.queries.some(q=>/^(UPDATE|INSERT|DELETE)/.test(q.sql)));}
 const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');assert.match(source,/before.marking===marking\?before.destination_branch_id/);assert.doesNotMatch(source,/name=CASE marking WHEN/);
 const pending=readFileSync(new URL('../lib/inventory/system-registration.ts',import.meta.url),'utf8');assert.match(pending,/o.reference,o.destination_branch_id/);assert.match(pending,/WHERE NOT o.is_foreign/);
});
