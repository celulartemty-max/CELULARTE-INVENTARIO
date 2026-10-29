import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture({allowed=true,valid=true,status='DRAFT'}={}){
  const queries=[];const code=ts.transpileModule(read('lib/inventory/returns.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};const mocks={'server-only':{},'@/lib/auth/special-permissions':{},'@/lib/auth/authorization':{assertBranchAccess:async()=>{if(!allowed)throw Error('FORBIDDEN')}},'./policy':{assertPositiveQuantity:n=>{if(!Number.isInteger(n)||n<1)throw Error('INVALID_QUANTITY')},canEditReception:(role,s)=>s==='DRAFT'||role==='MASTER'},'@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT id::text'))return{rows:[{id:'movement',branch_id:'branch',status}],rowCount:1};if(sql.startsWith('SELECT 1 FROM products'))return{rows:valid?[{}]:[],rowCount:valid?1:0};return{rows:[],rowCount:1}}})}};
  vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error})(n=>mocks[n]??require(n),m,m.exports);return{...m.exports,queries};
}
const data={productId:'product',modelReference:'N/A',quantity:4,condition:'GOOD',reason:''};
test('return saves a product without choosing or creating a catalogue colour',async()=>{
  const f=fixture();await f.saveReturnLine({role:'OPERATIVE'},'movement',data);
  const validation=f.queries.find(q=>q.sql.startsWith('SELECT 1 FROM products'));assert.equal(validation.args[1],null);assert.match(validation.sql,/p.status='ACTIVE'/);assert.match(validation.sql,/\$2::uuid IS NULL/);
  const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO return_lines'));assert.equal(insert.args[2],null);assert.equal(insert.args[4],4);assert.equal(f.queries.some(q=>/INSERT INTO product_colors/.test(q.sql)),false);
});
test('explicit legacy colour remains validated and accepted',async()=>{
  const f=fixture();await f.saveReturnLine({role:'MASTER'},'movement',{...data,colorId:'legacy'});assert.equal(f.queries.find(q=>q.sql.startsWith('INSERT INTO return_lines')).args[2],'legacy');
  const g=fixture({valid:false});await assert.rejects(g.saveReturnLine({role:'MASTER'},'movement',{...data,colorId:'wrong'}),/INVALID_PRODUCT_COLOR/);assert.equal(g.queries.some(q=>q.sql.startsWith('INSERT')),false);
});
test('branch, lifecycle, active product, quantity and damage safeguards remain enforced',async()=>{
  for(const opts of [{allowed:false},{status:'CLOSED'},{valid:false}]){const f=fixture(opts);await assert.rejects(f.saveReturnLine({role:'OPERATIVE'},'movement',data));assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false)}
  const f=fixture();await assert.rejects(f.saveReturnLine({role:'OPERATIVE'},'movement',{...data,quantity:0}));await assert.rejects(f.saveReturnLine({role:'OPERATIVE'},'movement',{...data,condition:'DAMAGED'}),/REASON_REQUIRED/);assert.equal(f.queries.length,0);
});
test('return screen, snapshots and registration retain colourless lines and historical colours',()=>{
  const editor=read('app/(app)/devoluciones/[id]/return-editor.tsx');assert.doesNotMatch(editor,/colors\[0\]|necesita al menos un color|colorId,modelReference/);
  for(const p of ['app/(app)/devoluciones/[id]/page.tsx','lib/inventory/returns.ts','lib/inventory/system-registration.ts'])assert.match(read(p),/LEFT JOIN product_colors/);
  assert.match(read('app/api/returns/route.ts'),/colorId:typeof b.colorId==='string'\?b.colorId:null/);
});
