import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const order='00000000-0000-4000-8000-000000000001',person='00000000-0000-4000-8000-000000000002',branch='00000000-0000-4000-8000-000000000003';
function fixture({access=true,open=true,changed=true}={}){
 const queries=[];const query=async(sql,args=[])=>{queries.push({sql,args});const rows=sql.startsWith('SELECT o.id,o.marking')?[{id:order,marking:'PER',branch_id:branch}]:sql.startsWith('SELECT 1 FROM receiving_cartons')?(open?[{ok:1}]:[]):sql.startsWith('INSERT INTO receiving_count_requests')?(changed?[{order_id:order}]:[]):sql.startsWith('UPDATE receiving_count_requests')?[{status:args[2]}]:[];return {rows,rowCount:rows.length}};
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
 for(const action of ['approve','deny']){const f=fixture();await assert.rejects(()=>f.countRequestAction({id:person,role:'MASTER',email:'alejandrop921@gmail.com'},{action,orderId:order,userId:person}),/Solo la cuenta/);assert.equal(f.queries.length,0);}
 const f=fixture();await assert.rejects(()=>f.countRequestList({id:person,role:'MASTER'}),/Sin permiso/);
 for(const action of ['approve','deny']){const f=fixture();await f.countRequestAction({id:f.countRequestOwner},{action,orderId:order,userId:person});const q=f.queries.find(q=>q.sql.startsWith('UPDATE receiving_count_requests'));assert.deepEqual(q.args,[order,person,action==='approve'?'APPROVED':'DENIED',f.countRequestOwner]);assert.ok(f.queries.some(q=>q.sql.includes('RECEIVING_COUNT_PERMISSION_DECIDED')));}
});
