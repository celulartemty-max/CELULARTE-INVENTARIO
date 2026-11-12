import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session=id(1),box=id(2),line=id(3),order=id(4),branch=id(5);
function load(path,mocks={}){const m={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'})')(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports;}
function fixture({module=true,finished=false,removable=false}={}){
 const queries=[],scopes=[];
 const query=async(sql,args)=>{queries.push({sql,args});const rows=sql.startsWith('DELETE FROM receiving_sessions')?(removable?[{id:session}]:[]):sql.includes('FROM receiving_sessions WHERE id=')?[{id:session,branch_id:branch,status:'DRAFT'}]:sql.startsWith('SELECT id,counted_at')?[{id:box,counted_at:finished?'today':null}]:sql.startsWith('SELECT id FROM receiving_items')?[{id:line}]:sql.startsWith('SELECT o.id,o.display_title')?[{id:order,display_title:'Anterior'}]:[];return{rows,rowCount:rows.length}};
 const f=load('lib/inventory/receiving.ts',{'server-only':{},'@/lib/auth/special-permissions':{requireSystemRegistration:async()=>{throw Error('NO_POS')}},'@/lib/db':{withTransaction:fn=>fn({query}),sql:async(strings,...args)=>(await query(strings.join('?'),args)).rows},'@/lib/auth/authorization':{hasModulePermission:async(u,m)=>m==='ENTRADAS'&&module,getAuthorizedBranchIds:async()=>[id(99)],assertBranchAccess:async(u,b)=>{scopes.push(b);if(u.role!=='MASTER')throw Error('FORBIDDEN_BRANCH')}},'./receiving-validation':load('lib/inventory/receiving-validation.ts'),'./shipping-marks':{},'./packing-reset':{},'./packing-column-order':{},'./receiving-order-removal':{}});
 return {...f,queries,scopes};
}
test('operative with ENTRADAS can count and save progress across branches; actions audit the actor and actual receipt branch',async()=>{
 for(const action of ['count','saveCount']){const f=fixture();await f.receivingAction({id:id(9),role:'OPERATIVE'},{action,sessionId:session,boxId:box,lines:[{id:line,quantity:12}]});assert.equal(f.scopes.length,0);assert.ok(f.queries.some(q=>q.sql.startsWith('UPDATE receiving_items')));const audit=f.queries.find(q=>q.sql.startsWith('INSERT INTO audit_events'));assert.equal(audit.args[0],id(9));assert.equal(audit.args[1],branch);}
});
test('empty receipt deletion requires master, confirmation and a server-side empty guard, and audits a recoverable snapshot',async()=>{
 const body={action:'deleteEmptyReceipt',sessionId:session,confirm:true};
 for(const role of ['OPERATIVE','MANAGER']){const f=fixture({removable:true});await assert.rejects(f.receivingAction({id:id(9),role},body));assert.ok(!f.queries.some(q=>q.sql.startsWith('DELETE')));}
 const unconfirmed=fixture({removable:true});await assert.rejects(unconfirmed.receivingAction({id:id(9),role:'MASTER'},{...body,confirm:false}));assert.ok(!unconfirmed.queries.some(q=>q.sql.startsWith('DELETE')));
 const occupied=fixture();await assert.rejects(occupied.receivingAction({id:id(9),role:'MASTER'},body),/vacía/);assert.ok(!occupied.queries.some(q=>q.sql.startsWith('INSERT')));
 const f=fixture({removable:true});await f.receivingAction({id:id(9),role:'MASTER'},body);const deletion=f.queries.find(q=>q.sql.startsWith('DELETE'));assert.ok(deletion.sql.includes("s.status='DRAFT'"));for(const table of ['receiving_cartons','receiving_foreign_cartons','receiving_documents','receiving_origin_registrations','receiving_destination_arrivals','audit_events'])assert.ok(deletion.sql.includes(table));assert.deepEqual(deletion.args,[session]);
 const audit=f.queries.find(q=>q.sql.startsWith('INSERT INTO audit_events'));assert.equal(audit.args[0],id(9));assert.equal(audit.args[2],'RECEIVING_EMPTY_RECEIPT_DELETED');assert.equal(JSON.parse(audit.args[3]).previous.id,session);
 const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8'),overview=readFileSync(new URL('../lib/inventory/receiving-overview.ts',import.meta.url),'utf8');assert.equal(source.match(/const emptyReceiptSql=`([\s\S]*?)`;/)[1],overview.match(/const emptyReceiptSql=`([\s\S]*?)`;/)[1]);
});
test('shared receipt view works without matching branch but does not expose freight, references or edit permissions to operatives',async()=>{
 const f=fixture();const view=await f.receivingView({id:id(9),role:'OPERATIVE'},session);assert.equal(view.canManageReceipt,false);assert.equal(view.cost,null);assert.equal(view.review,false);assert.equal(view.canRegisterSystem,false);assert.equal(f.scopes.length,0);
 assert.ok(f.queries.filter(q=>q.sql.includes('FROM receiving_items')).every(q=>!q.sql.includes('expected')));
 assert.ok(f.queries.some(q=>q.sql.startsWith('SELECT o.id::text,o.reference,o.display_title')&&q.sql.includes('counted_here')&&q.sql.includes('registered_here')));
 const denied=fixture({module:false});await assert.rejects(denied.receivingView({id:id(9),role:'OPERATIVE'},session));assert.equal(denied.queries.length,0);
});
test('shared count cannot overwrite a completed carton or run without ENTRADAS',async()=>{
 for(const options of [{module:false},{finished:true}]){const f=fixture(options);await assert.rejects(f.receivingAction({id:id(9),role:'OPERATIVE'},{action:'count',sessionId:session,boxId:box,lines:[{id:line,quantity:12}]}));assert.ok(!f.queries.some(q=>q.sql.startsWith('UPDATE')));}
});
test('cross-branch sharing does not grant closing, arrival, packing or POS permissions',async()=>{
 for(const action of ['close','arrive','packing','pos']){const f=fixture();await assert.rejects(f.receivingAction({id:id(9),role:'OPERATIVE'},{action,sessionId:session}));assert.ok(!f.queries.some(q=>/^(UPDATE|INSERT)/.test(q.sql)));}
});
test('master title changes are metadata-only and preserve shipping mark, count and ownership',async()=>{
 const f=fixture();await f.receivingAction({id:id(9),role:'MASTER'},{action:'setOrderTitle',sessionId:session,orderId:order,title:'  MERCADOLIBRE  '});const updates=f.queries.filter(q=>q.sql.startsWith('UPDATE'));assert.equal(updates.length,1);assert.equal(updates[0].sql,'UPDATE receiving_orders SET display_title=$1 WHERE id=$2');assert.equal(updates[0].args[0],'MERCADOLIBRE');
 const denied=fixture();await assert.rejects(denied.receivingAction({id:id(9),role:'OPERATIVE'},{action:'setOrderTitle',sessionId:session,orderId:order,title:'OTRA'}));assert.ok(!denied.queries.some(q=>q.sql.startsWith('UPDATE')));
});
