import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(overrides={},allowed=['origin'],module=true,special=true,photo=true){
 const t={id:'transfer',customer_sale:true,status:'DRAFT',origin_branch_id:'origin',destination_branch_id:'destination',paid_at:null,sent_at:null,origin_pos_registered_at:null,...overrides},queries=[];
 const mocks={'server-only':{},'@/lib/auth/authorization':{hasModulePermission:async()=>module,assertBranchAccess:async(u,b)=>{if(!allowed.includes(b))throw Error('FORBIDDEN_BRANCH')}},'@/lib/auth/special-permissions':{requireSystemRegistration:async()=>{if(!special)throw Error('NO_PERMISSION')}},'@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT * FROM transfers'))return{rows:[t]};if(sql.startsWith('SELECT count'))return{rows:[{n:1}]};if(sql.includes("action='POS_EVIDENCE_CAPTURED'"))return{rows:[],rowCount:photo?1:0};return{rows:[],rowCount:1}}})}};
 const code=ts.transpileModule(read('lib/inventory/customer-sale.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error})(n=>mocks[n]??require(n),m,m.exports);return{...m.exports,queries};
}
test('only destination confirms payment before sending or receiving; actor and destination recorded',async()=>{
 const f=fixture({},['destination']);await f.payCustomerSale({id:'actor'},'movement','destination');const q=f.queries.find(x=>x.sql.startsWith('UPDATE transfers SET paid_at'));assert.equal(q.args[1],'actor');assert.equal(q.args[2],'destination');
 const origin=fixture({},['origin','destination']);await assert.rejects(origin.payCustomerSale({id:'actor'},'movement','origin'));assert.equal(origin.queries.some(q=>q.sql.startsWith('UPDATE')),false);
});
test('payment denies unrelated branch, module denial, repeat, legacy and cancelled',async()=>{
 for(const [state,allowed,module]of [[{},['other'],true],[{},['destination'],false],[{paid_at:'already'},['destination'],true],[{customer_sale:false},['destination'],true],[{status:'CANCELLED'},['destination'],true]]){const f=fixture(state,allowed,module);await assert.rejects(f.payCustomerSale({id:'actor'},'movement','destination'));assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE')),false)}
});
test('sale registration is origin-only, paid and sent, with special permission and photo; receipt can follow later',async()=>{
 const ready={status:'WAITING_RECEIPT',sent_at:'sent',paid_at:'paid'};
 for(const f of [fixture(ready,['destination']),fixture({},['origin']),fixture(ready,['origin'],true,false),fixture(ready,['origin'],true,true,false)]){await assert.rejects(f.registerCustomerSale({id:'actor'},'movement'));assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE')),false)}
 const f=fixture(ready);await f.registerCustomerSale({id:'actor'},'movement');assert.ok(f.queries.some(q=>q.sql.includes('origin_pos_registered_by')));assert.ok(f.queries.every(q=>!q.sql.includes('SET destination_pos_registered')));
 const completion=f.queries.find(q=>q.sql.includes("SET status='COMPLETED'"));assert.match(completion.sql,/received_at IS NOT NULL AND paid_at IS NOT NULL AND origin_pos_registered_at IS NOT NULL/);
});
test('registration instructions never ask for transfer-out or destination-in for client sales',()=>{
 const s=read('lib/inventory/system-registration.ts');assert.match(s,/NOT t.customer_sale/);assert.match(s,/'CLIENT_SALE','origin'/);
 assert.match(read('app/(app)/registros/registration-detail.tsx'),/Confirmar venta registrada/);
 assert.match(read('lib/inventory/transfers.ts'),/t.customer_sale&&t.paid_at/);
});
test('compact client sale has destination-only payment, no branch selector and collapsed history',()=>{
 const s=read('app/(app)/traspasos/[id]/customer-sale.tsx');
 assert.doesNotMatch(s,/<select|setBranch|<h2>Confirmaciones/);
 assert.match(s,/lines.length>0&&canDestination/);assert.match(s,/branchId:t.destination_branch_id/);
 assert.match(s,/<summary>Ver detalles/);assert.match(s,/t.paidBy/);assert.match(s,/t.registeredBy/);
});
