import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function fixture({permission=true,access=true,boxes=[{id:'box',counted_at:'today'}],lines=[{carton_id:'box',quantity:10}],inserted=1,foreign=false,voided=false}={}){
 const queries=[];const module={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL('../lib/inventory/receiving-origin-registration.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const client={query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT * FROM receiving_orders'))return {rows:[{branch_id:'branch',is_foreign:foreign,voided_at:voided}]};if(sql.startsWith('SELECT b.id,b.counted_at'))return {rows:boxes};if(sql.includes('l.id line_id'))return {rows:lines};if(sql.startsWith('INSERT INTO receiving_origin_registrations'))return {rowCount:inserted};return {rows:[]}}};
 const mocks={'server-only':{},'node:crypto':require('node:crypto'),'@/lib/db':{withTransaction:fn=>fn(client)},'@/lib/auth/special-permissions':{requireSystemRegistration:async()=>{if(!permission)throw Error('Sin permiso')}},'@/lib/auth/authorization':{assertBranchAccess:async()=>{if(!access)throw Error('Sin acceso')}}};
 vm.runInNewContext('(function(require,module,exports){'+code+'})')(name=>mocks[name],module,module.exports);
 return {...module.exports,queries,lines};
}
test('completed order registers only its locked pending cartons with a snapshot and actor audit',async()=>{
 const f=fixture();await f.confirmOriginOrder({id:'actor'},'order',f.originRevision(f.lines));
 assert.match(f.queries[0].sql,/receiving_sessions.*ORDER BY s.id FOR UPDATE/);
 assert.match(f.queries[1].sql,/receiving_orders.*FOR UPDATE/);
 const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO receiving_origin_registrations'));
 assert.deepEqual(Array.from(insert.args[0]),['box']);assert.equal(insert.args[1],'actor');assert.match(insert.sql,/snapshot/);
 assert.match(f.queries.at(-1).sql,/RECEIVING_ORDER_POS_REGISTERED/);
});
test('denied permission or foreign, voided and cross-branch orders cannot register',async()=>{
 for(const options of [{permission:false},{access:false},{foreign:true},{voided:true}]){const f=fixture(options);await assert.rejects(f.confirmOriginOrder({id:'a'},'o',f.originRevision(f.lines)));assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT')))}
});
test('stale preview, unfinished counts, empty lines and repeated registration are rejected without writes',async()=>{
 for(const options of [{boxes:[]},{boxes:[{id:'box',counted_at:null}]},{lines:[]},{lines:[{carton_id:'box',quantity:null}]}]){const f=fixture(options);await assert.rejects(f.confirmOriginOrder({id:'a'},'o',f.originRevision(f.lines)));assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT')))}
 for(const revision of [undefined,'0'.repeat(64)]){const f=fixture();await assert.rejects(f.confirmOriginOrder({id:'a'},'o',revision));assert.ok(!f.queries.some(q=>q.sql.startsWith('INSERT')))}
 const f=fixture({inserted:0});await assert.rejects(f.confirmOriginOrder({id:'a'},'o',f.originRevision(f.lines)),/ya se registraron/);assert.ok(!f.queries.some(q=>q.sql.includes('INSERT INTO audit_events')));
});
test('freshness token changes with quantities, model, carton and count revision',()=>{
 const f=fixture();const original=[{carton_id:'a',model:'A',quantity:5,counted_at:'now'}];const hash=f.originRevision(original);
 for(const change of [{quantity:6},{model:'B'},{carton_id:'b'},{counted_at:'later'}])assert.notEqual(hash,f.originRevision([{...original[0],...change}]));
});
test('receipt closure excludes previously confirmed cartons and UI offers compact per-order registration',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('lib/inventory/system-registration.ts'),/RECEIVING_ORDER[\s\S]*count\(\*\) FILTER\(WHERE b.counted_at IS NULL/);
 assert.match(read('lib/inventory/receiving.ts'),/outstanding.rows\[0\].n===0 \? 'POS_REGISTERED'/);
 assert.match(read('lib/inventory/receiving.ts'),/recordOriginCartons\(c,u,remaining.map/);
 assert.match(read('app/(app)/entradas/pedidos/[id]/receiving-editor.tsx'),/RegistrationQueue compact[\s\S]*buttonLabel="Registrar en sistema"/);
 const migration=read('migrations/20261110_receiving_order_registration.sql');assert.match(migration,/carton_id uuid PRIMARY KEY/);assert.match(migration,/s.status='POS_REGISTERED'/);assert.match(migration,/BEFORE INSERT OR UPDATE OR DELETE ON receiving_items/);
});
