import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user={id:id(1),role:'MASTER'},session={id:id(2),branch_id:id(3),status:'DRAFT',total_boxes:2};
const box={id:id(4),order_id:id(5),carton_number:'1',counted_at:null};
function fixture({rows=[box],partial=false,arrived=false,registered=false,foreign=0,existing=[]}={}){
 const calls=[],c={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM receiving_cartons WHERE session_id'))return{rows};if(sql.includes(' partial,'))return{rows:[{partial,arrived,registered}]};if(sql.startsWith('SELECT * FROM receiving_orders'))return{rows:[{id:id(5)}]};if(sql.startsWith('SELECT * FROM receiving_cartons WHERE order_id'))return{rows:existing};if(sql.includes('sum(carton_count)'))return{rows:[{n:foreign}]};return{rows:[],rowCount:1}}};
 const module={exports:{}};vm.runInNewContext('(function(require,module,exports){'+ts.transpileModule(read('lib/inventory/receipt-edit.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText+'})',{Error})(n=>n==='server-only'?{}:require(n),module,module.exports);
 return{calls,run:(body={},u=user,s=session)=>module.exports.editReceipt(c,u,s,{total:2,reason:'Captura equivocada',...body})};
}
test('receipt edits reject every non-master and closed/registered receipts before reads or writes',async()=>{
 for(const role of ['MANAGER','OPERATIVE']){const f=fixture();await assert.rejects(f.run({}, {...user,role}),/Máster/);assert.equal(f.calls.length,0)}
 for(const status of ['CLOSED','POS_REGISTERED']){const f=fixture();await assert.rejects(f.run({},user,{...session,status}),/cerrada/);assert.equal(f.calls.length,0)}
});
test('total changes require a reason and cannot undercut identified plus foreign cartons',async()=>{
 for(const body of [{reason:''},{total:0},{total:1}]){const f=fixture({foreign:1});await assert.rejects(f.run(body));assert.equal(f.calls.some(q=>q.sql.startsWith('UPDATE')),false)}
 const f=fixture();await f.run({total:5});assert.ok(f.calls.some(q=>q.sql.startsWith('UPDATE receiving_sessions')&&q.args[0]===5));
});
test('retiring an uncounted carton detaches it and records actor/reason without deleting packing data',async()=>{
 const f=fixture();await f.run({total:1,remove:[box.id]});assert.ok(f.calls.some(q=>q.sql.includes('SET session_id=NULL')));assert.ok(f.calls.every(q=>!q.sql.startsWith('DELETE')));const audit=f.calls.find(q=>q.sql.startsWith('INSERT INTO audit_events'));assert.equal(audit.args[0],user.id);assert.equal(audit.args[4],'Captura equivocada');
});
test('partial counts including zero, completed counts, destination arrivals and registrations block removal',async()=>{
 for(const options of [{partial:true},{arrived:true},{registered:true},{rows:[{...box,counted_at:'done'}]}]){const f=fixture(options);await assert.rejects(f.run({remove:[box.id]}),/conteo/);assert.equal(f.calls.some(q=>q.sql.startsWith('UPDATE')),false)}
 const f=fixture();await assert.rejects(f.run({remove:[id(99)]}),/no pertenece/);
});
test('new numbers and pending arrivals can be added to an existing receipt order without replacing lines',async()=>{
 const f=fixture();await f.run({total:3,orderId:box.order_id,numbers:['2','3']});assert.equal(f.calls.filter(q=>q.sql.startsWith('INSERT INTO receiving_cartons')).length,2);assert.ok(f.calls.every(q=>!q.sql.includes('UPDATE receiving_items')));
 const g=fixture({existing:[{id:id(6),carton_number:'2',session_id:null}]});await g.run({orderId:box.order_id,numbers:['2']});assert.ok(g.calls.some(q=>q.sql.startsWith('UPDATE receiving_cartons SET session_id=$1')));
 const h=fixture({existing:[{id:id(6),carton_number:'2',session_id:id(20)}]});await assert.rejects(h.run({orderId:box.order_id,numbers:['2']}),/ya está recibida/);
});
test('editor exposes receipt control only behind master flag and keeps API branch/module transaction checks',()=>{
 const ui=read('app/(app)/entradas/pedidos/[id]/receiving-editor.tsx');assert.match(ui,/data.canRecount&&draft&&<ReceiptEdit/);
 const api=read('lib/inventory/receiving.ts');assert.ok(api.indexOf('await assertBranchAccess(u, s.branch_id)')<api.indexOf("b.action==='editReceipt'"));assert.match(api,/else await receivingAccess\(u\)/);
 const control=read('app/(app)/entradas/pedidos/[id]/receipt-edit.tsx');assert.match(control,/lock.current/);assert.match(control,/role="alert"/);assert.match(control,/Motivo del cambio/);
});
