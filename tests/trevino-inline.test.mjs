import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function page({branch='Treviño',status='CLOSED',shipped=false,waived=false,module=true}={}){
 const m={id:'exit',branch,branch_id:'branch',status},full={id:'full',shipped_at:shipped?'now':null,waived_at:waived?'now':null};
 const source=ts.transpileModule(read('app/(app)/salidas/[id]/page.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};let authorized=false;
 vm.runInNewContext('(function(require,module,exports){'+source+'})',{})(n=>{
  if(n.endsWith('.css'))return{};
  if(n==='next/link')return()=>null;
  if(n==='@/lib/auth/authorization')return{requireUser:async()=>({role:'OPERATIVE'}),assertBranchAccess:async()=>{authorized=true;},hasModulePermission:async()=>module};
  if(n==='@/lib/db')return{sql:async parts=>{const s=parts.join('');if(s.includes('FROM inventory_movements'))return[m];if(s.includes('FROM full_orders')){assert.equal(authorized,true);return[full];}return[];}};
  if(n==='./exit-editor')return{__esModule:true,default:'ExitEditor'};
  if(n==='../pedidos/workflow-controls')return{Contribution:'Contribution'};
  return require(n);
 },mod,mod.exports);
 return mod.exports.default({params:Promise.resolve({id:'exit'})});
}
test('main FULL and review screens no longer have a separate contribution form',()=>{
 for(const p of ['app/(app)/salidas/pedidos/[orderId]/page.tsx','app/(app)/salidas/revision-full/page.tsx'])assert.doesNotMatch(read(p),/<Contribution/);
 assert.doesNotMatch(read('app/(app)/salidas/pedidos/workflow-controls.tsx'),/Aportar piezas de Treviño/);
});
test('closed Treviño exit exposes the same audited product form inside its own page',async()=>{const tree=await page();assert.equal(tree.props.children[2].type,'Contribution');assert.equal(tree.props.children[2].props.orderId,'full');});
test('no duplicate draft form and no additions for Plaza, shipped FULL or missing module',async()=>{for(const opts of [{status:'DRAFT'},{branch:'Plaza del Audio'},{shipped:true},{module:false},{status:'CANCELLED'}]){const tree=await page(opts);assert.equal(Boolean(tree.props.children[2]),false);}});
test('waived Treviño can add before dispatch without creating a second exit',async()=>{const tree=await page({status:'CANCELLED',waived:true});assert.equal(tree.props.children[2].type,'Contribution');const service=read('lib/inventory/full-review.ts');assert.match(service,/SELECT movement_id::text FROM full_order_exits WHERE order_id=\$1 AND branch_id=\$2/);assert.match(service,/if\(waived.rows\[0\]\?\.waived_at\)/);});
test('Plaza-only FULL still has a Treviño entry without creating an empty exit on a GET',()=>{const p=read('app/(app)/salidas/pedidos/[orderId]/trevino/page.tsx');assert.match(p,/if\(!data.canReview\)/);assert.match(p,/redirect\('\/salidas\//);assert.doesNotMatch(p,/INSERT|createExit|contributeToFull/);assert.match(p,/<Contribution/);});
