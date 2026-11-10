import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const {renderToStaticMarkup}=require('react-dom/server');
async function render({view,role='MASTER',rows=[]}={}){
 const mod={exports:{}},calls=[];
 const code=ts.transpileModule(read('app/(app)/salidas/pedidos/page.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{Map,Number})(n=>n.endsWith('.css')?{}:n==='next/link'?({children,...props})=>require('react').createElement('a',props,children):n==='@/lib/auth/authorization'?{requireUser:async()=>({role})}:n==='@/lib/inventory/full-orders'?{fullOrderRows:async(...args)=>{calls.push(args);return rows;},fullOrderStatus:()=>view==='history'?'Enviado':'Pendiente'}:require(n),mod,mod.exports);
 return {html:renderToStaticMarkup(await mod.exports.default({searchParams:Promise.resolve({view})})),calls};
}
test('compact tabs stay inline, expose current view and preserve history filter',async()=>{
 for(const view of [undefined,'history']){const {html,calls}=await render({view});assert.match(html,/class="fullListTabs"/);assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.equal(calls[0][3],view==='history');assert.match(html,/No hay pedidos en esta vista/);}
 const css=read('app/(app)/salidas/pedidos/compact-list.css');assert.match(css,/\.fullListTabs\{display:flex/);assert.match(css,/min-height:44px/);assert.match(css,/minmax\(0,1fr\)/);assert.match(css,/@media\(max-width:600px\)/);
});
test('one compact row per FULL, cancelled pieces excluded, title escaped and scope retained',async()=>{
 const rows=[{id:'one',reference:'123',title:'CASE <test>',branch:'Plaza del Audio',status:'CLOSED',pieces:80},{id:'one',branch:'Treviño',status:'CANCELLED',pieces:20}];
 const {html}=await render({role:'OPERATIVE',rows});assert.equal((html.match(/class="fullListRow"/g)||[]).length,1);assert.match(html,/80 <small>pzas/);assert.match(html,/CASE &lt;test&gt;/);assert.match(html,/Plaza \+ Treviño/);assert.match(html,/Cantidades de tus sucursales/);assert.match(html,/href="\/salidas\/pedidos\/one"/);assert.doesNotMatch(html,/piezas capturadas|Abrir pedido|class="card pad"/);
});
