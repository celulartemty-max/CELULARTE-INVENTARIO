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
 const req=name=>name.endsWith('/registration-queue')?{default:()=>null}:name==='react'?react:name==='next/navigation'?{useRouter:()=>({refresh(){}})}:name==='next/link'?{default:p=>React.createElement('a',p,p.children)}:name.startsWith('@/lib/inventory/')?load(name.replace('@/','')+'.ts',react):name.startsWith('.')?load(posix.join(posix.dirname(path),name+'.tsx'),react):requireModule(name);
 class FixtureFormData {constructor(form){this.fields=form.fields}get(key){return this.fields[key]??null}}
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{FormData:FixtureFormData,crypto:{randomUUID:()=> '01234567-1234-4000-8000-000000000001'},window:{scrollTo(){}},confirm:()=>true})(req,mod,mod.exports);
 return mod.exports;
}
function mount(path,name,props){
 const state=[];let cursor=0;
 const react={...React,useId:()=> 'fixture-upload-help',useTransition:()=>[false,fn=>fn()],useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}};
 const Component=load(path,react)[name];
 return ()=>{cursor=0;return Component(props)};
}
function nodes(node){if(node==null||typeof node==='boolean')return [];if(Array.isArray(node))return node.flatMap(nodes);return typeof node==='object'?[node,...nodes(node.props?.children)]:[]}
function text(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(text).join('');return typeof node==='object'?text(node.props?.children):String(node)}
const base='app/(app)/entradas/pedidos/[id]/';
const BatchIntake=load(base+'batch-intake.tsx').default;
const productId='00000000-0000-4000-8000-000000000001',products=[{id:productId,name:'Combo Case'}];
const batch={id:'A',reference:'PED-20',product:'Combo Case',shipping:'SEA',marking:'PER NICO',is_foreign:false,total:20,received_here:18,received_total:18,remaining:2};
test('mixed count shows separate products with independent line IDs and no blind reference leak',()=>{
 const CountGrid=load(base+'count-grid.tsx').default;
 const items=[{id:'clear-line',product_id:'clear',product_label:'CLEAR',model:'SAM S24',color:'',counted:null,expected:50},{id:'privacy-line',product_id:'privacy',product_label:'PRIVACY',model:'SAM S24',color:'',counted:0,expected:150}];
 const html=renderToStaticMarkup(React.createElement(CountGrid,{items,disabled:false,showReference:false}));assert.match(html,/<h4>CLEAR/);assert.match(html,/<h4>PRIVACY/);assert.match(html,/name="clear-line"/);assert.match(html,/name="privacy-line"/);assert.doesNotMatch(html,/Esperado:|150/);
});
test('mixed order skips a single product selection but preserves physical carton selection',async()=>{
 const calls=[];const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async body=>{calls.push(body);return true},onSaved(){}});let tree=render();
 const checkbox=nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.ok(checkbox);checkbox.props.onChange({target:{checked:true}});tree=render();
 const total=nodes(tree).find(n=>n.type==='input'&&n.props.name==='total');total.props.onChange({target:{value:'36'}});tree=render();
 await tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{shipping:'SEA',marking:'JAPS',total:'36',reference:'MIXED-36'}}});assert.equal(calls.length,1);assert.equal(calls[0].isMixed,true);assert.equal(calls[0].productId,null);assert.equal(calls[0].received,36);assert.equal(calls[0].total,36);
});
test('receiving missing cartons uses the same tiles, exact existing IDs and leaves unselected cartons pending',async()=>{
 const calls=[];let success=false;
 const boxes=['11','14','015/21'].map((n,i)=>({id:'pending-'+i,carton_number:n,order_id:'A'}));
 const props={batch:{...batch,total:21,remaining:3},boxes,busy:false,save:async value=>{calls.push(JSON.parse(JSON.stringify(value)));return success}};
 const render=mount(base+'batch-intake.tsx','ExistingArrival',props);let tree=render();
 assert.ok(!nodes(tree).some(n=>n.type==='input'||n.type==='details'));assert.equal(nodes(tree).filter(n=>n.props?.['aria-pressed']!==undefined).length,3);
 const click=label=>{nodes(tree).find(n=>n.props?.['aria-label']===label).props.onClick();tree=render()};
 const submit=async()=>{await tree.props.onSubmit({preventDefault(){}});tree=render()};
 await submit();assert.equal(calls.length,0);
 click('Caja 14');assert.match(text(tree),/1 recibidas · 2 seguirán pendientes/);await submit();assert.deepEqual(calls[0],{action:'arrive',boxIds:['pending-1']});assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='Caja 14').props['aria-pressed'],true);
 click('Caja 14');click('Caja 14');assert.match(text(tree),/1 recibidas/);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Seleccionar todas').props.onClick();tree=render();assert.match(text(tree),/3 recibidas · 0 seguirán pendientes/);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Quitar todas').props.onClick();tree=render();assert.match(text(tree),/0 recibidas · 3 seguirán pendientes/);
 click('Caja 015/21');success=true;await submit();assert.deepEqual(calls.at(-1).boxIds,['pending-2']);assert.match(text(tree),/0 recibidas/);
 props.busy=true;tree=render();assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));await submit();assert.equal(calls.length,2);
});
test('product combobox filters inline, selects on tap or keyboard and clears stale selections',()=>{
 const catalog=[{id:'1',name:'Cerámica Privacidad'},{id:'2',name:'Combo Case'},{id:'3',name:'Cerámica Mate'}];
 const render=mount(base+'batch-intake.tsx','NewBatchForm',{products:catalog,busy:false,save:async()=>true,onSaved(){}});
 const input=()=>nodes(render()).find(n=>n.props?.role==='combobox');
 const search=value=>input().props.onChange({target:{value}});
 const options=()=>nodes(render()).filter(n=>n.props?.role==='option');
 assert.equal(input().props['aria-expanded'],false);assert.equal(options().length,0);
 search('PRIVACIDAD ceramica');assert.deepEqual(options().map(text),['Cerámica Privacidad']);
 options()[0].props.onClick();assert.equal(input().props.value,'Cerámica Privacidad');assert.equal(options().length,0);
 assert.equal(nodes(render()).find(n=>n.props?.name==='product').props.value,'1');
 search('combo');assert.deepEqual(options().map(text),['Combo Case']);assert.equal(nodes(render()).find(n=>n.props?.name==='product').props.value,'');
 const key=key=>input().props.onKeyDown({key,preventDefault(){},stopPropagation(){}});
 key('ArrowDown');key('Enter');assert.equal(input().props.value,'Combo Case');assert.equal(nodes(render()).find(n=>n.props?.name==='product').props.value,'2');
 search('inexistente');assert.match(text(render()),/Sin resultados/);assert.equal(options().length,0);
 search('');assert.equal(options().length,3);key('Escape');assert.equal(options().length,0);
 assert.equal(nodes(mount(base+'batch-intake.tsx','NewBatchForm',{products:catalog,busy:true,save:async()=>true,onSaved(){}})()).find(n=>n.type==='fieldset').props.disabled,true);
});
test('order badges distinguish uncounted, partial, counted and registered cartons in the current receipt',()=>{
 const Status=load(base+'batch-intake.tsx').BatchStatus;
 const render=change=>renderToStaticMarkup(React.createElement(Status,{batch:{...batch,...change}}));
 assert.match(render({counted_here:0}),/Pendientes · 0\/18 contadas/);
 assert.match(render({counted_here:5}),/Pendientes · 5\/18 contadas/);
 assert.match(render({counted_here:18}),/✓ Contadas · 18\/18/);
 assert.match(render({counted_here:18,registered_here:18}),/✓ Registrado en sistema/);
 const partial=render({counted_here:18,registered_here:7});assert.match(partial,/✓ Contadas/);assert.match(partial,/7\/18 registradas/);assert.doesNotMatch(partial,/✓ Registrado en sistema/);
 assert.doesNotMatch(render({counted_here:0,received_here:0,registered_here:0}),/✓ Contadas|✓ Registrado/);
});
test('foreign external orders need no count; internal orders show only destination progress',()=>{
 const Status=load(base+'batch-intake.tsx').BatchStatus;
 const render=change=>renderToStaticMarkup(React.createElement(Status,{batch:{...batch,is_foreign:true,...change}}));
 assert.match(render({destination_name:null}),/Solo registro/);assert.doesNotMatch(render({destination_name:'CDMX'}),/Pendientes|Contadas/);
 assert.match(render({destination_name:'Plaza del Audio',counted_here:1}),/Estado en destino/);
 assert.match(render({destination_name:'Treviño',counted_here:18,registered_here:18}),/✓ Registrado en sistema/);
 const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');
 assert.match(source,/b.counted_at IS NOT NULL AND \(NOT o.is_foreign OR \(o.marking IN/);
 assert.match(source,/dr.counted_at=b.counted_at/);assert.match(source,/receiving_origin_registrations orig/);
});
test('overview has one simple table and add button, no inline form or packing/count instructions',()=>{
 const html=renderToStaticMarkup(React.createElement(BatchIntake,{batches:[batch,{...batch,id:'pending',received_here:0}],pending:[],products,busy:false,draft:true,save:async()=>true,onOpen(){}}));
 assert.match(html,/Agregar pedido/);assert.match(html,/Abrir pedido/);assert.match(html,/Faltan del pedido/);assert.match(html,/<b>18<\/b> <small>de 20<\/small>/);
 assert.doesNotMatch(html,/<form|<input|Packing list|Conteo|Recibidas acumuladas/);assert.equal((html.match(/Abrir pedido/g)||[]).length,1);
});
test('operative sees the same receipt order table and progress without add or freight controls',()=>{
 const data={review:false,canRecount:false,canManageReceipt:false,session:{id:'session',reference:'Llegada',total_boxes:20,status:'DRAFT'},batches:[{...batch,counted_here:3,destination_name:'Treviño'}],orders:[],boxes:[],items:[],foreign:[],foreignBoxes:[],documents:[],cost:null,pending:[]};
 const tree=mount(base+'receiving-editor.tsx','default',{data,products:[]})();
 const list=nodes(tree).find(n=>n.type===BatchIntake||n.props?.batches===data.batches);
 assert.ok(list);assert.equal(list.props.draft,false);
 const html=renderToStaticMarkup(React.createElement(BatchIntake,list.props));
 assert.match(html,/Pedidos de esta recepción/);assert.match(html,/Treviño/);assert.match(html,/3\/18 contadas/);assert.match(html,/Ver pedido/);
 assert.doesNotMatch(html,/Agregar pedido|Recibir faltantes|Flete/);
});
test('add action opens a separate dialog, and opening a row targets that order',()=>{
 let opened;const render=mount(base+'batch-intake.tsx','default',{batches:[batch],pending:[],products,busy:false,draft:true,save:async()=>true,onOpen:id=>{opened=id}});
 let tree=render();nodes(tree).find(n=>n.type==='button'&&text(n)==='+ Agregar pedido').props.onClick();tree=render();
 const dialog=nodes(tree).find(n=>n.props?.title==='Agregar pedido');assert.ok(dialog);dialog.props.onClose();
 tree=render();assert.ok(!nodes(tree).some(n=>n.props?.title==='Agregar pedido'));nodes(tree).find(n=>n.type==='button'&&text(n)==='Abrir pedido').props.onClick();assert.equal(opened,'A');
});
test('mobile product name opens its order without horizontal scrolling, and stays disabled during a request',()=>{
 let opened;const props={batches:[batch],pending:[],products,busy:false,draft:true,save:async()=>true,onOpen:id=>{opened=id}};
 const render=mount(base+'batch-intake.tsx','default',props);const button=nodes(render()).find(n=>n.props?.className==='receivingOrderOpen');
 assert.match(text(button),/Combo Case/);assert.match(text(button),/Ver pedido/);button.props.onClick();assert.equal(opened,'A');
 const busy=mount(base+'batch-intake.tsx','default',{...props,busy:true});assert.equal(nodes(busy()).find(n=>n.props?.className==='receivingOrderOpen').props.disabled,true);
});
test('complete order auto-fills received cartons and submits a valid range without requiring a reference',async()=>{
 let payload,saved=false;const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{payload=value;return true},onSaved:()=>{saved=true}});
 let tree=render();nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'20'}});tree=render();
 assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,20);assert.ok(!nodes(tree).some(n=>n.props?.name==='numbers'));assert.ok(!nodes(tree).find(n=>n.props?.name==='reference').props.required);
 await tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{product:productId,shipping:'SEA',marking:'PER NICO'}}});
 assert.equal(payload.received,20);assert.equal(payload.total,20);assert.equal(payload.numbers,Array.from({length:20},(_,i)=>String(i+1)).join(','));assert.match(payload.reference,/Combo Case · PER NICO-/);assert.ok(saved);
});
test('carton tiles update arrival count, toggle without duplicates, reject empty selection and preserve failed save',async()=>{
 const calls=[];const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{calls.push(value);return false},onSaved:()=>assert.fail('must not close on failed save')});
 let tree=render();nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'20'}});tree=render();
 const click=label=>{nodes(tree).find(n=>n.props?.['aria-label']===label).props.onClick();tree=render()};
 click('Caja 13');click('Caja 14');assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,18);assert.ok(nodes(tree).find(n=>n.props?.name==='received').props.readOnly);
 const submit=numbers=>tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{product:productId,shipping:'SEA',marking:'PER NICO',numbers}}});
 await submit('ignored');assert.equal(calls.length,1);assert.equal(calls[0].received,18);assert.equal(calls[0].numbers,'1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,18,19,20');tree=render();assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,18);
 click('Caja 13');click('Caja 13');assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,18);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Quitar todas').props.onClick();tree=render();await submit('');tree=render();assert.equal(calls.length,1);assert.match(text(tree),/Selecciona al menos una caja/);
 nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'3'}});tree=render();assert.equal(nodes(tree).filter(n=>n.props?.['aria-label']?.startsWith('Caja ')).length,3);assert.equal(nodes(tree).find(n=>n.props?.name==='received').props.value,3);
});
test('external shipping mark hides all product and supplier controls and saves without a product',async()=>{
 let payload;const render=mount(base+'batch-intake.tsx','NewBatchForm',{products,busy:false,save:async value=>{payload=value;return true},onSaved(){}});
 let tree=render();nodes(tree).find(n=>n.props?.name==='marking').props.onChange({target:{value:'GAL'}});tree=render();assert.ok(!nodes(tree).some(n=>n.props?.role==='combobox'||['product','productLabel','supplier'].includes(n.props?.name)));
 nodes(tree).find(n=>n.props?.name==='total').props.onChange({target:{value:'5'}});tree=render();await tree.props.onSubmit({preventDefault(){},currentTarget:{fields:{shipping:'AIR',marking:'GAL'}}});
 assert.ok(payload.isForeign);assert.equal(payload.productId,null);assert.equal(payload.received,5);
});
test('JAPS destination packing can be prepared at source without enabling source counting',()=>{
 const japs={...batch,id:'J',marking:'JAPS',destination_name:'Plaza del Audio',is_foreign:true,received_here:1};
 const data={review:true,canRecount:true,session:{id:'session',reference:'Llegada',arrival_date:'2026-11-03',total_boxes:1,status:'DRAFT',carrier:'',tracking:''},batches:[japs],orders:[{id:'J',reference:japs.reference}],boxes:[],items:[],foreign:[],foreignBoxes:[{id:'jbox',order_id:'J',carton_number:'1',product:'Mica'}],documents:[{id:'jdoc',order_id:'J',filename:'japs-original.xlsx'}],cost:null,pending:[]};
 const render=mount(base+'receiving-editor.tsx','default',{data,products});let tree=render();nodes(tree).find(n=>n.props?.onOpen).props.onOpen('J');tree=render();
 assert.match(text(tree),/Packing list para Plaza del Audio/);assert.match(text(tree),/Leer packing list con IA/);assert.match(text(tree),/japs-original.xlsx/);assert.doesNotMatch(text(tree),/Cajas ajenas · solo registro/);
 assert.equal(nodes(tree).find(n=>n.type==='button'&&text(n)==='Contar piezas').props.disabled,true);assert.ok(!nodes(tree).some(n=>n.props?.className==='receivingBoxButton'));
 const core=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');assert.match(core,/order.is_foreign && !order.packing_allowed/);assert.match(core,/marking IN \('PER','JAPS'\)/);assert.match(core,/NOT o.is_foreign OR \(o.marking IN/);
});
test('explicitly delegated JAPS boxes enable origin counting without a POS action',()=>{
 const japs={...batch,id:'J',marking:'JAPS',destination_name:'Plaza del Audio',is_foreign:true,received_here:1};
 const data={review:true,canRecount:true,session:{id:'session',reference:'Llegada',arrival_date:'2026-11-03',total_boxes:1,status:'DRAFT'},batches:[japs],orders:[{id:'J',reference:japs.reference}],boxes:[{id:'jbox',order_id:'J',carton_number:'1',product:'Otter',counted_at:null}],items:[{id:'line',carton_id:'jbox',model:'IP 11',color:'BLACK',counted:null}],foreign:[],foreignBoxes:[],documents:[],cost:null,pending:[],registrationRows:[]};
 const render=mount(base+'receiving-editor.tsx','default',{data,products});let tree=render();nodes(tree).find(n=>n.props?.onOpen).props.onOpen('J');tree=render();
 assert.equal(nodes(tree).find(n=>n.type==='button'&&text(n)==='Contar piezas').props.disabled,false);
 assert.doesNotMatch(text(tree),/Packing list para Plaza del Audio|Registrar en sistema/);
 assert.ok(nodes(tree).some(n=>n.props?.className==='receivingBoxButton'));
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
const CloseSummary=load(base+'receiving-close.tsx').default;
const closeProps={canRegisterSystem:true,sessionId:'receipt',status:'DRAFT',total:43,boxes:Array.from({length:35},(_,i)=>({id:'box-'+i,order_id:'own-order',counted_at:i===0?'2026-10-26':null})),foreignTotal:8,busy:false,onClose(){},onPos(){},onReview(){}};
test('closure summary is visible without a dropdown and has an independent Excel download link',()=>{
 const html=renderToStaticMarkup(React.createElement(CloseSummary,closeProps));
 assert.match(html,/Resumen y cierre/);assert.doesNotMatch(html,/<details|Cerrar recepción \/ Descargar Excel/);
 assert.match(html,/href="\/api\/receiving\/export\?id=receipt"/);assert.match(html,/Descargar el Excel no cierra ni modifica/);
 assert.match(html,/>43<small> \/ 43<\/small>/);assert.match(html,/>1<small> \/ 35<\/small>/);
 assert.match(html,/34 cajas de esta sucursal están pendientes/);assert.match(html,/8 cajas de otras sucursales/);
});
test('missing identification, unfinished counts and excess cartons block closure with exact explanations',()=>{
 for(const props of [{...closeProps,total:45},{...closeProps,total:40},closeProps]){
  let closed=false,reviewed;const tree=CloseSummary({...props,onClose:()=>closed=true,onReview:id=>reviewed=id});
  const finish=nodes(tree).find(n=>n.props?.className==='receivingCloseFinish');assert.equal(finish.props.disabled,true);finish.props.onClick();assert.equal(closed,false);
  nodes(tree).find(n=>n.type==='button'&&text(n)==='Revisar pendientes →').props.onClick();assert.equal(reviewed,'own-order');
  if(props.total===45)assert.match(text(tree),/Falta identificar 2 cajas/);
  if(props.total===40)assert.match(text(tree),/Hay 3 cajas de más/);
 }
});
test('ready own cartons and foreign-only receipts can close without waiting for destination counts',()=>{
 for(const props of [{...closeProps,boxes:closeProps.boxes.map(b=>({...b,counted_at:'2026-10-26'}))},{...closeProps,boxes:[],foreignTotal:43}]){
  let closed=0;const tree=CloseSummary({...props,onClose:()=>closed++});const finish=nodes(tree).find(n=>n.props?.className==='receivingCloseFinish');
  assert.equal(finish.props.disabled,false);assert.match(text(tree),/Listo para finalizar/);finish.props.onClick();assert.equal(closed,1);
  assert.equal(nodes(tree).filter(n=>n.props?.className==='receivingClosePending').length,0);
 }
});
test('busy closure cannot submit; closed state exposes only manual registration confirmation',()=>{
 let pos=0,closed=0;
 const busy=CloseSummary({...closeProps,boxes:[],foreignTotal:43,busy:true,onClose:()=>closed++});nodes(busy).find(n=>n.props?.className==='receivingCloseFinish').props.onClick();assert.equal(closed,0);
 const tree=CloseSummary({...closeProps,status:'CLOSED',onPos:()=>pos++});assert.doesNotMatch(text(tree),/Finalizar recepción|Antes de finalizar/);
 const button=nodes(tree).find(n=>n.props?.className==='receivingCloseFinish');assert.equal(text(button),'Confirmar registro en sistema');button.props.onClick();assert.equal(pos,1);
});
test('archived, registered and unknown states never expose repeat close or registration actions',()=>{
 for(const status of ['ARCHIVED','POS_REGISTERED','UNKNOWN']){
  const tree=CloseSummary({...closeProps,status});assert.equal(nodes(tree).filter(n=>n.props?.className==='receivingCloseFinish').length,0);
  assert.equal(nodes(tree).filter(n=>n.props?.className==='receivingCloseExport').length,1);
 }
});
const ReceiptCard=load('app/(app)/entradas/pedidos/receiving-receipt-card.tsx').default;
const receiptFixture={id:'receipt-43',reference:'LUNES',arrival_date:'2026-10-25',total_boxes:43,status:'DRAFT',origin:'Treviño',arrived:43,counted:1,can_open:true,destinations:[{session_id:'receipt-43',order_id:'japs-order',product:'OTTER CLEAR',marking:'JAPS',shipping:'SEA',destination:'Plaza del Audio',boxes:5,arrived:2,counted:1,can_open:true}]};
test('JAPS appears inside the original 43-box receipt in a native expandable section, never as another receipt',()=>{
 const html=renderToStaticMarkup(React.createElement(ReceiptCard,{receipt:receiptFixture}));
 assert.equal((html.match(/<article/g)||[]).length,1);assert.equal((html.match(/<details/g)||[]).length,1);
 assert.match(html,/5 de estas 43 cajas/);assert.match(html,/Plaza del Audio · JAPS/);assert.match(html,/2 recibidas en destino · 1 contadas/);
 assert.match(html,/<progress[^>]+max="43"[^>]+value="43"/);assert.doesNotMatch(html,/>48</);
 assert.ok(html.indexOf('Plaza del Audio · JAPS')>html.indexOf('<details'));assert.ok(html.indexOf('japs-order')<html.indexOf('</article>'));
 const beforeDetails=html.slice(0,html.indexOf('<details'));assert.ok(beforeDetails.lastIndexOf('<a ')<beforeDetails.lastIndexOf('</a>'));
});
test('destination-only user sees the shared receipt but cannot open its source or see origin count/status',()=>{
 const html=renderToStaticMarkup(React.createElement(ReceiptCard,{receipt:{...receiptFixture,can_open:false,counted:null}}));
 assert.doesNotMatch(html,/href="\/entradas\/pedidos\/receipt-43"|Cajas propias contadas|En captura/);
 assert.match(html,/href="\/entradas\/pedidos\/destino\/japs-order"/);assert.match(html,/Cajas contadas en tu sucursal/);
});
test('origin-only user sees destination progress inline but no destination count link',()=>{
 const html=renderToStaticMarkup(React.createElement(ReceiptCard,{receipt:{...receiptFixture,destinations:receiptFixture.destinations.map(d=>({...d,can_open:false}))}}));
 assert.match(html,/href="\/entradas\/pedidos\/receipt-43"/);assert.doesNotMatch(html,/href="\/entradas\/pedidos\/destino\//);
 assert.match(html,/Confirma su llegada en Plaza del Audio/);
});
test('same mark groups visually, while separate orders keep separate destinations and packing lists',()=>{
 const html=renderToStaticMarkup(React.createElement(ReceiptCard,{receipt:{...receiptFixture,destinations:[...receiptFixture.destinations,{...receiptFixture.destinations[0],order_id:'second-order',product:'ANILLO',boxes:3}]}}));
 assert.equal((html.match(/<h4>/g)||[]).length,1);assert.match(html,/8 de estas 43 cajas/);
 assert.match(html,/destino\/japs-order/);assert.match(html,/destino\/second-order/);
});
const uploadProps={file:null,busy:false,attached:false,onChange(){},onInterpret(){},onAttach(){}};
test('packing upload starts with one clear action, not a native file input or disabled action clutter',()=>{
 const tree=mount(base+'packing-upload.tsx','default',uploadProps)();
 assert.deepEqual(nodes(tree).filter(n=>n.type==='button').map(n=>text(n)),['Agregar archivo']);
 assert.equal(nodes(tree).filter(n=>n.props?.type==='file').length,0);
 assert.doesNotMatch(text(tree),/No file chosen|Leer con IA|Guardar original/);
});
test('single add action offers camera, gallery and file; only the camera input requests capture',()=>{
 let chosen;const render=mount(base+'packing-upload.tsx','default',{...uploadProps,onChange:file=>{chosen=file}});
 let tree=render();nodes(tree).find(n=>n.type==='button').props.onClick();tree=render();
 const inputs=nodes(tree).filter(n=>n.props?.type==='file');
 assert.deepEqual(inputs.map(n=>n.props['aria-label']),['Tomar foto','Elegir foto','Seleccionar archivo']);
 assert.equal(inputs[0].props.capture,'environment');assert.equal(inputs[1].props.capture,undefined);assert.equal(inputs[2].props.capture,undefined);
 const file={name:'packing.xlsx',size:25000,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 inputs[2].props.onChange({target:{files:[file],value:'packing.xlsx'}});assert.equal(chosen,file);
 tree=render();assert.ok(!nodes(tree).some(n=>n.props?.title==='Agregar archivo'));
});
test('canceling the picker preserves the selected file and invalid files never reach parent state',()=>{
 let calls=0;const render=mount(base+'packing-upload.tsx','default',{...uploadProps,file:{name:'original.xlsx',size:200},onChange:()=>calls++});
 let tree=render();nodes(tree).find(n=>n.type==='button'&&text(n)==='Cambiar').props.onClick();tree=render();
 const pick=file=>nodes(tree).find(n=>n.props?.['aria-label']==='Seleccionar archivo').props.onChange({target:{files:file?[file]:[],value:''}});
 pick();assert.equal(calls,0);
 pick({name:'grande.xlsx',size:21*1024*1024});tree=render();assert.match(text(tree),/hasta 20 MB/);
 pick({name:'foto.heic',size:200});tree=render();assert.match(text(tree),/Usa Excel .xlsx/);assert.equal(calls,0);
});
test('PDF offers storage only; saved original and busy actions cannot be submitted twice',()=>{
 let read=0,attach=0;
 const tree=mount(base+'packing-upload.tsx','default',{...uploadProps,file:{name:'cobro.pdf',size:200,type:'application/pdf'},onInterpret:()=>read++,onAttach:()=>attach++})();
 assert.doesNotMatch(text(tree),/Leer con IA/);nodes(tree).find(n=>n.type==='button'&&text(n)==='Guardar comprobante').props.onClick();assert.equal(attach,1);assert.equal(read,0);
 const saved=mount(base+'packing-upload.tsx','default',{...uploadProps,file:{name:'packing.xlsx',size:200},attached:true})();
 assert.equal(nodes(saved).find(n=>n.type==='button'&&text(n)==='✓ Original guardado').props.disabled,true);
 const busy=mount(base+'packing-upload.tsx','default',{...uploadProps,file:{name:'packing.xlsx',size:200},busy:true})();
 assert.ok(nodes(busy).filter(n=>n.type==='button').every(n=>n.props.disabled));
});
const destinationPath='app/(app)/entradas/pedidos/destino/[orderId]/destination-editor.tsx';
function destinationFixture(review=true){return {review,canRecount:false,order:{id:'order',product:'Combo Case',reference:'JAPS-20',marking:'JAPS',shipping:'SEA',supplier:'LISA',destination:'Plaza del Audio',origin:'Treviño',total:4,physical:3,arrived:2,counted:0},boxes:[{id:'a',carton_number:'1',session_id:'s',received_at:'2026-10-27',counted_at:null,notes:''},{id:'b',carton_number:'2',session_id:'s',received_at:'2026-10-27',counted_at:null,notes:''},{id:'c',carton_number:'3',session_id:'s',received_at:null,counted_at:null,notes:''},{id:'d',carton_number:'4',session_id:null,received_at:null,counted_at:null,notes:''}],items:[],documents:[]}}
test('destination shows only confirmed boxes for count and only physically registered boxes for arrival',()=>{
 const render=mount(destinationPath,'default',{data:destinationFixture()});const tree=render();
 assert.deepEqual(nodes(tree).filter(n=>n.props?.className==='receivingBoxButton').map(n=>n.props['aria-label']),['Caja 1','Caja 2']);
 assert.equal(nodes(tree).filter(n=>n.props?.type==='checkbox').length,1);
 assert.match(text(tree),/1 cajas todavía no llegan al origen/);assert.match(text(tree),/Plaza del Audio/);
});
test('mobile box switching retains previously visited forms instead of losing unsaved inputs',()=>{
 const render=mount(destinationPath,'default',{data:destinationFixture()});let tree=render();
 const forms=()=>nodes(tree).filter(n=>n.props?.box&&n.props?.onAdd);
 assert.deepEqual(forms().map(n=>n.props.box.id),['a']);
 nodes(tree).find(n=>n.props?.['aria-label']==='Caja 2').props.onClick();tree=render();
 assert.deepEqual(forms().map(n=>n.props.box.id),['a','b']);
 assert.equal(nodes(tree).find(n=>n.props?.hidden===true).props.children.props.box.id,'a');
});
test('operative destination workspace has no document preview, attachment or arrival confirmation controls',()=>{
 const tree=mount(destinationPath,'default',{data:destinationFixture(false)})();
 assert.ok(!nodes(tree).some(n=>n.props?.type==='file'||n.props?.type==='checkbox'));
 assert.doesNotMatch(text(tree),/Leer packing list con IA|Confirmar cajas recibidas/);
 assert.match(text(tree),/Un encargado debe confirmar/);
});
test('shipping marks are a closed list and only PER/JAPS map to internal destinations',()=>{
 const {SHIPPING_MARKS,shippingMarkSchema,destinationName}=load('lib/inventory/shipping-marks.ts');
 assert.equal(SHIPPING_MARKS.length,8);
 for(const mark of SHIPPING_MARKS)assert.equal(shippingMarkSchema.parse(mark),mark);
 for(const mark of ['PER LISA','CDMX','NICO',''])assert.equal(shippingMarkSchema.safeParse(mark).success,false);
 assert.equal(destinationName('PER'),'Treviño');assert.equal(destinationName('JAPS'),'Plaza del Audio');
 for(const mark of ['GAL','AD','JAPU','JACG','ASL','MCFE'])assert.equal(destinationName(mark),null);
});
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
