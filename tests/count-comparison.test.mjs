import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={}){const m={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'})')(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports;}
const logic=load('lib/inventory/count-comparison.ts'),compare=logic.countComparison;
const box={id:'a',counted_at:'today'},line={carton_id:'a',model:'A',color:'BLACK',expected:100,counted:100};
test('totals compare only received selected-order cartons and zero is a valid count',()=>{
 const s=compare([box],[{...line,expected:10,counted:0},{...line,carton_id:'another',counted:1000}]);assert.equal(s.expected,10);assert.equal(s.counted,0);assert.equal(s.difference,-10);assert.equal(s.missing,10);assert.equal(s.extra,0);
});
test('net zero never hides a shortage and surplus on different models or colors',()=>{
 const s=compare([box],[{...line,counted:80},{...line,color:'PINK',counted:120}]);assert.equal(s.expected,200);assert.equal(s.counted,200);assert.equal(s.difference,0);assert.equal(s.missing,20);assert.equal(s.extra,20);assert.equal(s.rows.length,2);
});
test('model/color quantities consolidate across boxes without merging different combinations',()=>{
 const s=compare([box,{id:'b',counted_at:'now'}],[{...line,model:' a ',counted:80},{...line,carton_id:'b',model:'A',counted:120}]);assert.equal(s.difference,0);assert.equal(s.rows.length,0);assert.equal(s.missing,0);assert.equal(s.extra,0);
});
test('no comparison before every box and line is counted, even if draft quantities look complete',()=>{
 for(const boxes of [[],[{...box,counted_at:null}],[box,{id:'b',counted_at:'now'}]])assert.equal(compare(boxes,[line]),null);
 for(const counted of [null,undefined,-1,1.5])assert.equal(compare([box],[{...line,counted}]),null);
 assert.equal(compare([box],[]),null);
});
test('unknown packing quantities stay unknown rather than becoming zero or false surplus',()=>{
 for(const expected of [null,undefined]){const s=compare([box],[{...line,expected}]);assert.equal(s.counted,100);assert.equal(s.expected,null);assert.equal(s.difference,null);assert.equal(s.unknown,1);assert.equal(s.extra,0);assert.equal(s.rows[0].difference,null);}
 const s=compare([box],[{...line,expected:0,counted:20}]);assert.equal(s.extra,20);assert.equal(s.difference,20);
});
const Component=load('app/(app)/entradas/pedidos/[id]/count-comparison.tsx',{'@/lib/inventory/count-comparison':logic}).default;
const render=items=>renderToStaticMarkup(React.createElement(Component,{boxes:[box],items}));
test('compact summary renders totals, netted discrepancy warning and expandable model/color detail',()=>{
 const html=render([{...line,counted:80},{...line,color:'PINK',counted:120}]);assert.match(html,/Packing/);assert.match(html,/Contadas/);assert.match(html,/Diferencia neta/);assert.match(html,/Faltan 20/);assert.match(html,/Sobran 20/);assert.match(html,/El total cuadra, pero hay diferencias/);assert.match(html,/<details><summary>Ver cajas con diferencias/);assert.match(html,/Faltan<!-- --> 20|Faltan 20/);assert.match(html,/Sobran<!-- --> 20|Sobran 20/);
});
test('unknown reference displays incomplete packing and never says there are no differences',()=>{
 const html=render([{...line,expected:null}]);assert.match(html,/Packing incompleto/);assert.match(html,/cantidades? sin identificar/);assert.doesNotMatch(html,/✓ Sin diferencias/);
 const equal=render([line]);assert.match(equal,/✓ Sin diferencias/);assert.doesNotMatch(equal,/<details>/);
});
test('known packing subtotal stays visible when a genuinely unknown quantity prevents a confirmed total',()=>{
 const items=[{...line,expected:2060,counted:2000},{...line,model:'UNKNOWN',expected:null,counted:60}];
 const s=compare([box],items);assert.equal(s.knownExpected,2060);assert.equal(s.expected,null);assert.equal(s.difference,null);
 const html=render(items);assert.match(html,/Packing identificado \(parcial\)/);assert.match(html,/>2,060<\/b>/);assert.match(html,/Packing incompleto/);assert.doesNotMatch(html,/✓ Sin diferencias/);
});
test('explicitly unlisted combinations have zero packing reference without hiding its exact total',()=>{
 const items=[{...line,expected:2060,counted:2000},{...line,model:'EXTRA',expected:0,counted:60},{...line,model:'NOT RECEIVED',expected:0,counted:0}];
 const s=compare([box],items);assert.equal(s.expected,2060);assert.equal(s.counted,2060);assert.equal(s.difference,0);assert.equal(s.unknown,0);assert.equal(s.extra,60);assert.equal(s.missing,60);
 const html=render(items);assert.doesNotMatch(html,/Packing incompleto|identificado \(parcial\)/);assert.match(html,/Faltan 60/);assert.match(html,/Sobran 60/);
});
test('both receiving views recover legacy unlisted reference only from the same exact insertion audit, and preserve blind counting',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 for(const path of ['lib/inventory/receiving.ts','lib/inventory/receiving-destination.ts']){
  const source=read(path);
  assert.match(source,/receiving_items\(carton_id,model,color,expected\) VALUES\(\$1,\$2,\$3,0\)/);
  assert.match(source,/inserted.entity_id=l.id AND inserted.action='ROW_INSERT'/);
  assert.match(source,/added.created_at=inserted.created_at AND added.user_id=inserted.user_id/);
  assert.match(source,/added.new_value->>'boxId'=l.carton_id::text/);
  assert.match(source,/inserted.new_value->>'expected' IS NULL/);
  assert.match(source,/changed.previous_value->'expected' IS DISTINCT FROM changed.new_value->'expected'/);
  assert.match(source,/COALESCE\(l.expected,CASE WHEN EXISTS/);
  assert.match(source,/THEN 0 ELSE NULL END\) ELSE NULL END expected/);
 }
 assert.match(read('lib/inventory/receiving.ts'),/const items = review \?/);
 assert.match(read('lib/inventory/receiving-destination.ts'),/CASE WHEN \$3::boolean AND b.counted_at IS NOT NULL THEN COALESCE/);
});
test('origin and destination summaries remain reviewer-only and use only current received boxes',()=>{
 const origin=readFileSync(new URL('../app/(app)/entradas/pedidos/[id]/receiving-editor.tsx',import.meta.url),'utf8');const destination=readFileSync(new URL('../app/(app)/entradas/pedidos/destino/[orderId]/destination-editor.tsx',import.meta.url),'utf8');
 assert.match(origin,/data.review&&<CountComparison boxes=\{currentBoxes\}/);assert.match(destination,/data.review&&<CountComparison boxes=\{arrived\}/);
});

test('only discrepant completed boxes appear, with every affected model and color, without cross-box cancellation',()=>{
 const boxes=[{...box,carton_number:'12'},{id:'b',counted_at:'now',carton_number:'2'},{id:'c',counted_at:'now',carton_number:'3'},{id:'d',counted_at:null,carton_number:'4'}];
 const items=[{...line,counted:80},{...line,color:'PINK',counted:110},{...line,carton_id:'b',counted:120},{...line,carton_id:'c'},{...line,carton_id:'d',counted:1}];
 const result=logic.boxDifferences(boxes,items);assert.equal(result.length,2);assert.equal(result[0].number,'2');assert.equal(result[1].number,'12');assert.equal(result[1].rows.length,2);assert.equal(result[1].rows[0].difference,-20);
 const html=renderToStaticMarkup(React.createElement(Component,{boxes:boxes.slice(0,3),items,onOpenBox:()=>{}}));
 assert.match(html,/Caja 12/);assert.match(html,/Caja 2/);assert.doesNotMatch(html,/Caja 3/);assert.match(html,/Ver caja 12/);
});
test('mixed products and unknown expectations never become a false confirmed difference',()=>{
 const items=[{...line,product_id:'p1',counted:80},{...line,product_id:'p2',counted:120},{...line,model:'UNKNOWN',expected:null,counted:50}];
 const result=logic.boxDifferences([box],items);assert.equal(result[0].rows.length,2);assert.equal(result[0].rows[0].difference,-20);assert.equal(result[0].rows[1].difference,20);
 assert.equal(logic.boxDifferences([box],[{...line,expected:null,counted:50}]).length,0);
});
test('both counters request server-side review without disclosing packing quantities',()=>{
 for(const path of ['lib/inventory/receiving.ts','lib/inventory/receiving-destination.ts']){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.match(src,/reviewDifferences===true/);assert.match(src,/requiresReview:true,differences/);assert.match(src,/map\(l=>\(\{model:String\(l.model\),color:String\(l.color\)\}\)\)/);
  assert.ok(src.indexOf('requiresReview:true')<src.indexOf("UPDATE receiving_items l SET counted=x.quantity"));
 }
});
