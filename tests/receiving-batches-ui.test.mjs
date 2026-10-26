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
 const buttons=nodes(tree).filter(n=>n.props?.className==='receivingBoxButton');assert.equal(buttons.length,1);assert.match(text(buttons[0]),/Caja 1/);
 assert.ok(text(tree).includes('solo-A.xlsx'));assert.ok(!text(tree).includes('solo-B.xlsx'));
 nodes(tree).find(n=>n.type==='button'&&text(n)==='← Todos los pedidos').props.onClick();tree=render();nodes(tree).find(n=>n.props?.onOpen).props.onOpen('C');tree=render();
 assert.match(text(tree),/Cajas ajenas · solo registro/);assert.ok(!nodes(tree).some(n=>n.props?.className==='receivingBoxButton'));assert.ok(!text(tree).includes('Leer packing list con IA'));
});
