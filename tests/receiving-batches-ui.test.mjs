import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const requireModule=createRequire(import.meta.url),ts=requireModule('typescript');
function load(path,react=React){
 const mod={exports:{}},source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const req=name=>name==='react'?react:name==='next/navigation'?{useRouter:()=>({refresh(){}})}:name==='next/link'?{default:p=>React.createElement('a',p,p.children)}:name==='@/lib/inventory/receiving-validation'?load('lib/inventory/receiving-validation.ts',react):name.startsWith('./')?load(posix.join(posix.dirname(path),name+'.tsx'),react):requireModule(name);
 class FixtureFormData {constructor(form){this.fields=form.fields}get(key){return this.fields[key]??null}}
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{FormData:FixtureFormData,crypto:{randomUUID:()=> '01234567-1234-4000-8000-000000000001'},window:{scrollTo(){}},confirm:()=>true})(req,mod,mod.exports);
 return mod.exports;
}
function mount(path,name,props){
 const state=[];let cursor=0;
 const react={...React,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}};
 const Component=load(path,react)[name];
 return ()=>{cursor=0;return Component(props)};
}
function nodes(node){if(node==null||typeof node==='boolean')return [];if(Array.isArray(node))return node.flatMap(nodes);return typeof node==='object'?[node,...nodes(node.props?.children)]:[]}
function text(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node)}
const base='app/(app)/entradas/pedidos/[id]/';
const BatchIntake=load(base+'batch-intake.tsx').default;
const productId='00000000-0000-4000-8000-000000000001',products=[{id:productId,name:'Combo Case'}];
const batch={id:'A',reference:'PED-20',product:'Combo Case',shipping:'SEA',marking:'PER NICO',is_foreign:false,total:20,received_here:18,received_total:18,remaining:2};
test('overview has one simple table and add button, no inline form or packing/count instructions',()=>{
 const html=renderToStaticMarkup(React.createElement(BatchIntake,{batches:[batch,{...batch,id:'pending',received_here:0}],pending:[],products,busy:false,draft:true,save:async()=>true,onOpen(){}}));
 assert.match(html,/Agregar pedido/);assert.match(html,/Abrir pedido/);assert.match(html,/Faltan del pedido/);assert.match(html,/<b>18<\/b> <small>de 20<\/small>/);
 assert.doesNotMatch(html,/<form|<input|Packing list|Conteo|Recibidas acumuladas/);assert.equal((html.match(/Abrir pedido/g)||[]).length,1);
});
test('add action opens a separate dialog, and opening a row targets that order',()=>{
 let opened;const render=mount(base+'batch-intake.tsx','default',{batches:[batch],pending:[],products,busy:false,draft:true,save:async()=>true,onOpen:id=>{opened=id}});
 let tree=render();nodes(tree).find(n=>n.type==='button'&&text(n)==='+ Agregar pedido').props.onClick();tree=render();
 const dialog=nodes(tree).find(n=>n.props?.title==='Agregar pedido');assert.ok(dialog);dialog.props.onClose();
 tree=render();assert.ok(!nodes(tree).some(n=>n.props?.title==='Agregar pedido'));nodes(tree).find(n=>n.type==='button'&&text(n)==='Abrir pedido').props.onClick();assert.equal(opened,'A');
});
test('complete order auto-fills received cartons and submits a valid range without requiring a reference',async()=>{
 let payload,saved=false;const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{payload=value;return true},onSaved:()=>{saved=true}});
 let tree=render();nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'20'}});tree=render();
 assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,'20');assert.ok(!nodes(tree).some(n=>n.props?.name==='numbers'));assert.ok(!nodes(tree).find(n=>n.props?.name==='reference').props.required);
 await tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{product:productId,shipping:'SEA',marking:'PER NICO'}}});
 assert.equal(payload.received,20);assert.equal(payload.total,20);assert.equal(payload.numbers,'1-20');assert.match(payload.reference,/Combo Case · PER NICO-/);assert.ok(saved);
});
test('partial order asks for exact numbers, validates quantity and preserves a failed form',async()=>{
 const calls=[];const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{calls.push(value);return false},onSaved:()=>assert.fail('must not close on failed save')});
 let tree=render();nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'20'}});tree=render();nodes(tree).find(n=>n.props?.name==='received').props.onChange({target:{value:'18'}});tree=render();
 assert.ok(nodes(tree).some(n=>n.props?.name==='numbers'&&n.props.required));
 const submit=numbers=>tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{product:productId,shipping:'SEA',marking:'PER NICO',numbers}}});
 await submit('1-17');assert.equal(calls.length,0);tree=render();assert.match(text(tree),/no coinciden/);
 await submit('1-12,15-20');assert.equal(calls.length,1);assert.equal(calls[0].received,18);assert.equal(calls[0].numbers,'1-12,15-20');tree=render();assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,'18');
});
test('foreign order without catalog product still supports manual label',async()=>{
 let payload;const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{payload=value;return true},onSaved(){}});
 let tree=render();nodes(tree).find(n=>n.type==='select'&&!n.props.name).props.onChange({target:{value:'foreign'}});tree=render();assert.ok(nodes(tree).some(n=>n.props?.name==='productLabel'));
 nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'5'}});tree=render();await tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{productLabel:'ANILLO CDMX',shipping:'AIR',marking:'CDMX'}}});
 assert.ok(payload.isForeign);assert.equal(payload.productId,null);assert.equal(payload.received,5);
});
test('order workspace filters boxes and files to the opened order; foreign has no packing or count',()=>{
 const other={...batch,id:'B',reference:'OTHER',product:'Anillo',received_here:1},foreign={...batch,id:'C',is_foreign:true,product:'Mica CDMX',received_here:1};
 const data={review:true,canRecount:true,session:{id:'session',reference:'Llegada',arrival_date:'2026-10-25',total_boxes:200,status:'DRAFT',carrier:'',tracking:''},batches:[batch,other,foreign],orders:[{id:'A',reference:'PED-20'},{id:'B',reference:'OTHER'}],boxes:[{id:'boxA',order_id:'A',carton_number:'1',product:'Combo Case',shipping:'SEA',marking:'PER NICO',counted_at:null,notes:''},{id:'boxB',order_id:'B',carton_number:'9',product:'Anillo',shipping:'SEA',marking:'PER',counted_at:null,notes:''}],items:[],foreign:[],foreignBoxes:[{id:'boxC',order_id:'C',carton_number:'1',product:'Mica CDMX'}],documents:[{id:'docA',order_id:'A',filename:'solo-A.xlsx'},{id:'docB',order_id:'B',filename:'solo-B.xlsx'}],cost:null,pending:[]};
 const render=mount(base+'receiving-editor.tsx','default',{data,products});let tree=render();assert.ok(!text(tree).includes('Leer packing list con IA'));
 nodes(tree).find(n=>n.props?.onOpen).props.onOpen('A');tree=render();
 const buttons=nodes(tree).filter(n=>n.props?.className==='receivingBoxButton');assert.equal(buttons.length,1);assert.match(buttons[0].props['aria-label'],/Caja 1/);
 assert.ok(text(tree).includes('solo-A.xlsx'));assert.ok(!text(tree).includes('solo-B.xlsx'));
 nodes(tree).find(n=>n.type==='button'&&text(n)==='← Todos los pedidos').props.onClick();tree=render();nodes(tree).find(n=>n.props?.onOpen).props.onOpen('C');tree=render();
 assert.match(text(tree),/Cajas ajenas · solo registro/);assert.ok(!nodes(tree).some(n=>n.props?.className==='receivingBoxButton'));assert.ok(!text(tree).includes('Leer packing list con IA'));
});

const gridModule=load(base+'packing-review.tsx');
test('count grid preserves IDs, blank and explicit zero, and hides reference during blind count',()=>{
 const CountGrid=load(base+'count-grid.tsx').default;
 const items=[{id:'one',model:'SAM A36',color:'negro',counted:null,expected:200},{id:'two',model:'SAM A36',color:'rojo',counted:0,expected:150}];
 const html=renderToStaticMarkup(React.createElement(CountGrid,{items,disabled:false,showReference:false}));
 assert.match(html,/Modelo \/ Color/);assert.match(html,/name="one"/);assert.match(html,/name="two"/);assert.match(html,/value="0"/);assert.doesNotMatch(html,/value="200"|Esperado:/);
 const closed=renderToStaticMarkup(React.createElement(CountGrid,{items,disabled:true,showReference:true}));assert.match(closed,/disabled/);assert.match(closed,/Esperado: 150/);
});
const samplePacking=()=>({reference:'PED-A',warnings:[],boxes:[
 {number:'1',items:[{model:'SAM A36',color:'negro',expected:200},{model:'SAM A36',color:'rojo',expected:150},{model:'SAM A32',color:'negro',expected:0},{model:'SAM A32',color:'rojo',expected:null}]},
 {number:'3',items:[{model:'OTHER',color:'',expected:70}]}
]});
function gridMount(packing=samplePacking()){
 const props={packing,busy:false,onChange:value=>{props.packing=value}};
 return {props,render:mount(base+'packing-review.tsx','default',props)};
}
test('packing grid pivots models and colors without summing or losing original indexes',()=>{
 const box=samplePacking().boxes[0];box.items.push({...box.items[0],expected:3});
 const grid=gridModule.boxGrid(box);
 assert.deepEqual([...grid.models],['SAM A36','SAM A32']);assert.deepEqual([...grid.colors],['negro','rojo']);
 assert.deepEqual([...grid.cells.get(JSON.stringify(['SAM A36','negro']))],[0,4]);
 const html=renderToStaticMarkup(React.createElement(gridModule.default,{packing:{reference:'',warnings:[],boxes:[box]},busy:false,onChange(){}}));
 assert.match(html,/Duplicado 1/);assert.match(html,/Duplicado 2/);assert.match(html,/value="200"/);assert.match(html,/value="3"/);
});
test('packing review renders one Excel-style box with real zero and unknown quantity distinct',()=>{
 const {render}=gridMount();const tree=render();
 const inputs=nodes(tree).filter(n=>n.props?.type==='number');assert.equal(inputs.length,4);
 assert.deepEqual(inputs.map(n=>n.props.value),[200,150,0,'']);
 assert.ok(!text(tree).includes('OTHER'));assert.ok(text(tree).includes('Modelo / Color'));
 assert.ok(text(tree).includes('350 piezas de referencia conocidas'));
 assert.equal(nodes(tree).filter(n=>n.type==='td'&&n.props.className==='packingUnclear').length,1);
});
test('grid cell edit affects only reference on the original selected box; empty remains null',()=>{
 const {render,props}=gridMount();let tree=render();
 nodes(tree).find(n=>n.props?.type==='number').props.onChange({target:{value:'210'}});
 assert.equal(props.packing.boxes[0].items[0].expected,210);assert.equal(props.packing.boxes[1].items[0].expected,70);
 tree=render();nodes(tree).find(n=>n.props?.type==='number').props.onChange({target:{value:''}});
 assert.equal(props.packing.boxes[0].items[0].expected,null);
 assert.ok(props.packing.boxes.every(b=>b.items.every(i=>!('counted' in i))));
});
test('review navigation, pending filter and edits invalidate only the changed box mark',()=>{
 const {render}=gridMount();let tree=render();
 nodes(tree).find(n=>n.type==='button'&&text(n)==='✓ Marcar caja revisada').props.onClick();tree=render();
 assert.match(text(tree),/1 revisadas/);assert.ok(text(tree).includes('OTHER'));
 nodes(tree).find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:true}});tree=render();
 assert.equal(nodes(nodes(tree).find(n=>n.props?.['aria-label']==='Seleccionar caja para revisar')).filter(n=>n.type==='option').length,1);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='✓ Marcar caja revisada').props.onClick();tree=render();
 assert.match(text(tree),/Todas las cajas están marcadas/);
 nodes(tree).find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:false}});tree=render();
 nodes(tree).find(n=>n.props?.type==='number').props.onChange({target:{value:'71'}});tree=render();
 assert.match(text(tree),/1 revisadas/);assert.match(text(tree),/1 pendientes/);
});
test('missing matrix combinations are absent, not zeros, and only added on explicit click',()=>{
 const packing=samplePacking();packing.boxes[0].items.pop();const {render,props}=gridMount(packing);let tree=render();
 assert.equal(nodes(tree).filter(n=>n.props?.type==='number').length,3);
 nodes(tree).find(n=>n.props?.className==='packingAbsent').props.onClick();tree=render();
 assert.equal(props.packing.boxes[0].items.length,4);assert.equal(props.packing.boxes[0].items[3].expected,null);
 assert.equal(nodes(tree).filter(n=>n.props?.type==='number').length,4);
});
test('add box chooses an unused number and delete preserves independent contents',()=>{
 const {render,props}=gridMount();let tree=render();
 nodes(tree).find(n=>n.type==='button'&&text(n)==='+ Otra caja independiente').props.onClick();tree=render();
 assert.equal(props.packing.boxes[2].number,'2');assert.equal(props.packing.boxes[2].items[0].expected,null);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Quitar esta caja de la lectura').props.onClick();
 assert.deepEqual([...props.packing.boxes.map(b=>b.number)],['1','3']);assert.equal(props.packing.boxes[0].items[0].expected,200);
});
test('packing form integrates the grid and keeps explicit per-order confirmation',()=>{
 const data={review:true,canRecount:true,session:{id:'session',reference:'Llegada',total_boxes:20,status:'DRAFT'},batches:[batch],orders:[{id:'A',reference:'PED-20'}],boxes:[],items:[],foreign:[],foreignBoxes:[],documents:[],cost:null,pending:[]};
 const render=mount(base+'receiving-editor.tsx','default',{data,products});let tree=render();
 nodes(tree).find(n=>n.props?.onOpen).props.onOpen('A');tree=render();
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Capturar sin archivo').props.onClick();tree=render();
 const grid=nodes(tree).find(n=>n.props?.onChange&&n.props?.packing);assert.ok(grid);assert.equal(grid.props.packing.reference,'PED-20');
 assert.match(text(tree),/Las cantidades contadas seguirán vacías/);assert.match(text(tree),/Confirmar contenido para este pedido/);
});
