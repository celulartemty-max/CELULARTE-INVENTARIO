import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const requireModule=createRequire(import.meta.url),ts=requireModule('typescript');
function load(path){const mod={exports:{}};const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;const req=name=>name==='@/lib/inventory/receiving-validation'?load('lib/inventory/receiving-validation.ts'):requireModule(name);vm.runInNewContext('(function(require,module,exports){'+code+'})')(req,mod,mod.exports);return mod.exports;}
const BatchIntake=load('app/(app)/entradas/pedidos/[id]/batch-intake.tsx').default;
test('new reception exposes bulk order attributes and separate total/received fields',()=>{
 const html=renderToStaticMarkup(React.createElement(BatchIntake,{batches:[],pending:[],products:[],busy:false,draft:true,save:async()=>true}));
 assert.match(html,/Un bonche = un pedido/);assert.match(html,/Total de cajas del pedido/);assert.match(html,/Cajas que llegaron hoy/);assert.match(html,/Números de las cajas recibidas/);assert.match(html,/name="received"/);assert.match(html,/name="numbers"/);assert.match(html,/Guardar pedido y llegada del bonche/);
 assert.doesNotMatch(html,/type="checkbox"/);
});
test('batch summary keeps 18 here, 20 total and 2 pending separate without per-box attribute forms',()=>{
 const b={id:'batch',reference:'PED-20',product:'Combo Case',shipping:'SEA',marking:'PER NICO',is_foreign:false,total:20,received_here:18,received_total:18,remaining:2};
 const html=renderToStaticMarkup(React.createElement(BatchIntake,{batches:[b],pending:[],products:[],busy:false,draft:false,save:async()=>true}));
 assert.match(html,/<td>20<\/td><td>18<\/td><td>18<\/td><td>2<\/td>/);assert.match(html,/PED-20/);assert.doesNotMatch(html,/<form/);
});
