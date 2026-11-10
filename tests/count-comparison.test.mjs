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
 const html=render([{...line,counted:80},{...line,color:'PINK',counted:120}]);assert.match(html,/Packing/);assert.match(html,/Contadas/);assert.match(html,/Diferencia neta/);assert.match(html,/Faltan 20/);assert.match(html,/Sobran 20/);assert.match(html,/El total cuadra, pero hay diferencias/);assert.match(html,/<details><summary>Ver diferencias por modelo\/color/);assert.match(html,/>-20</);assert.match(html,/>\+20</);
});
test('unknown reference displays incomplete packing and never says there are no differences',()=>{
 const html=render([{...line,expected:null}]);assert.match(html,/Packing incompleto/);assert.match(html,/Sin identificar/);assert.doesNotMatch(html,/✓ Sin diferencias/);
 const equal=render([line]);assert.match(equal,/✓ Sin diferencias/);assert.doesNotMatch(equal,/<details>/);
});
test('origin and destination summaries remain reviewer-only and use only current received boxes',()=>{
 const origin=readFileSync(new URL('../app/(app)/entradas/pedidos/[id]/receiving-editor.tsx',import.meta.url),'utf8');const destination=readFileSync(new URL('../app/(app)/entradas/pedidos/destino/[orderId]/destination-editor.tsx',import.meta.url),'utf8');
 assert.match(origin,/data.review&&<CountComparison boxes=\{currentBoxes\}/);assert.match(destination,/data.review&&<CountComparison boxes=\{arrived\}/);
});
