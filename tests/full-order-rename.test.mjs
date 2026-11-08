import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='00000000-0000-4000-8000-000000000001';
const body={id,title:'COMBO NUEVO',previousTitle:'COMBO MOTOROLA'};
function fixture({role='MASTER',permission=true,old='COMBO MOTOROLA',exists=true,exits=2}={}){
 const queries=[],mod={exports:{}};const code=ts.transpileModule(read('lib/inventory/rename-full-order.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error})(n=>n==='server-only'?{}:n==='./full-orders'?{requireFullAccess:async()=>{if(!permission)throw Error('DENIED');}}:n==='@/lib/db'?{withTransaction:async fn=>fn({query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.startsWith('SELECT title')?(exists?[{title:old}]:[]):sql.startsWith('SELECT branch_id')?Array.from({length:exits},(_,i)=>({branch_id:'b'+i,movement_id:'m'+i})):[]};}})}:require(n),mod,mod.exports);
 return{queries,run:b=>mod.exports.renameFullOrder({id:'master',role},b??body)};
}
test('rename is MASTER and Salidas only, before database access',async()=>{for(const opts of[{role:'OPERATIVE'},{role:'MANAGER'},{permission:false}]){const f=fixture(opts);await assert.rejects(f.run());assert.equal(f.queries.length,0);}});
test('rename rejects blank, oversized names, invalid ids and additional mutation fields',async()=>{for(const change of[{title:' '},{title:'x'.repeat(161)},{id:'bad'},{reference:'new'},{expectedPieces:3},{branchIds:[]}]){const f=fixture();await assert.rejects(f.run({...body,...change}));assert.equal(f.queries.length,0);}});
test('rename changes only title under row lock and audits both branch exits',async()=>{const f=fixture();const result=await f.run({...body,title:' COMBO NUEVO '});assert.equal(result.title,'COMBO NUEVO');assert.match(f.queries[0].sql,/FOR UPDATE/);const writes=f.queries.filter(q=>q.sql.startsWith('UPDATE'));assert.equal(writes.length,1);assert.equal(writes[0].sql,'UPDATE full_orders SET title=$1 WHERE id=$2::uuid');assert.deepEqual(JSON.parse(JSON.stringify(writes[0].args)),['COMBO NUEVO',id]);const events=f.queries.filter(q=>q.sql.includes('FULL_ORDER_RENAMED'));assert.equal(events.length,2);assert.equal(JSON.parse(events[0].args[3]).title,body.previousTitle);assert.equal(JSON.parse(events[0].args[4]).title,body.title);assert.ok(f.queries.every(q=>!q.sql.includes('UPDATE inventory_movements')&&!q.sql.includes('UPDATE exit_lines')));});
test('stale edits, missing orders and missing linked exits do not write',async()=>{for(const opts of[{old:'CAMBIADO'},{exists:false},{exits:0}]){const f=fixture(opts);await assert.rejects(f.run());assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE')||q.sql.startsWith('INSERT')),false);}});
test('saving unchanged title is a no-op',async()=>{const f=fixture();await f.run({...body,title:body.previousTitle});assert.equal(f.queries.length,1);});
test('compact name editor is MASTER-only, uses audited PATCH, and preserves cancel and visible errors',()=>{const page=read('app/(app)/salidas/pedidos/[orderId]/page.tsx');assert.match(page,/user.role==='MASTER'&&<EditName/);assert.match(read('app/api/full-orders/route.ts'),/PATCH=auditRoute\(rename\)/);const form=read('app/(app)/salidas/pedidos/[orderId]/edit-name.tsx');for(const token of['Editar nombre','Guardar','Cancelar',"method:'PATCH'",'previousTitle:title','role="alert"','router.refresh()','lock.current'])assert.ok(form.includes(token));});
