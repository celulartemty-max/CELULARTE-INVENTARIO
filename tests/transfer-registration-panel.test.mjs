import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},extra={}){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{URLSearchParams,...extra})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    return mod.exports;
}
const transfer={id:'movement',folio:'TRA-1',origin:'Treviño',destination:'Plaza del Audio',origin_branch_id:'origin',destination_branch_id:'destination',destinationInternal:true,status:'PENDING_POS',transferKind:'TRANSFER',sent_at:'2026-10-27T12:00:00Z',origin_pos_registered_at:null,destination_pos_registered_at:null};
function editorFixture(overrides={},permission=true){
    const controls=[];
    const Editor=load('app/(app)/traspasos/[id]/transfer-editor.tsx',{
        react:{useState:v=>[v,()=>{}]},'../../registration-access':{useRegistrationAccess:()=>permission},
        '../../registros/registration-queue':{default:props=>{controls.push(props);return React.createElement('button',null,props.buttonLabel)}},
    }).default;
    const html=renderToStaticMarkup(React.createElement(Editor,{transfer:{...transfer,...overrides},lines:[],products:[],canOrigin:true,canDestination:true,role:'MASTER'}));
    return {controls,html};
}
test('transfer origin and destination launch the same scoped registration panel with clear labels',()=>{
    const {controls,html}=editorFixture();assert.equal(controls.length,2);
    assert.deepEqual(controls.map(c=>c.rows[0].side),['origin','destination']);
    assert.deepEqual(controls.map(c=>c.rows[0].branch),['Treviño','Plaza del Audio']);
    assert.ok(controls.every(c=>c.compact&&c.rows[0].id==='movement'&&c.rows[0].kind==='TRANSFER'));
    assert.match(html,/Confirmar salida registrada/);assert.match(html,/Confirmar entrada registrada/);
});
test('no registration permission, pending receipt, differences and completed states cannot launch a panel',()=>{
    assert.equal(editorFixture({},false).controls.length,0);
    for(const status of ['WAITING_RECEIPT','RECEIVED_WITH_DIFFERENCES','DRAFT','COMPLETED'])assert.equal(editorFixture({status}).controls.length,0);
    assert.equal(editorFixture({origin_pos_registered_at:'done'}).controls.length,1);
    assert.equal(editorFixture({destinationInternal:false}).controls.length,1);
});
function queueFixture(ok=true){
    const state=[],requests=[];let cursor=0;
    const detail=load('app/(app)/registros/registration-detail.tsx');
    const row={id:'movement',kind:'TRANSFER',side:'destination',branch:'Plaza del Audio',branch_id:'destination',reference:'TRA-1',created_at:transfer.sent_at,correction:false};
    const Queue=load('app/(app)/registros/registration-queue.tsx',{
        react:{useRef:()=>({current:false}),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=v}]},useTransition:()=>[false,fn=>fn()]},
        'next/navigation':{useRouter:()=>({refresh(){}})},'./registration-detail':detail,
        '../entradas/pedidos/[id]/receiving-modal':{default:p=>React.createElement('section',null,p.children)},
        '../pos-camera-guard':{},'../entradas/pedidos/receiving.css':{},'./registration.css':{},
    },{fetch:async url=>{requests.push(url);return {ok,json:async()=>ok?{row,lines:[{product:'AG GLASS',quantity:12},{product:'ANILLO',quantity:8}]}:{error:'El registro ya no está pendiente'}}}}).default;
    return {requests,render:()=>{cursor=0;return Queue({rows:[row],compact:true,buttonLabel:'Confirmar entrada registrada'})}};
}
function walk(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(walk)]}
test('compact button opens fresh server detail with products, quantities, total and evidence before confirmation',async()=>{
    const f=queueFixture();const tree=f.render();assert.doesNotMatch(renderToStaticMarkup(tree),/Pendientes/);
    await walk(tree).find(n=>n.type==='button').props.onClick();
    assert.match(f.requests[0],/side=destination/);assert.match(f.requests[0],/kind=TRANSFER/);
    const html=renderToStaticMarkup(f.render());
    for(const text of ['Registrar una ENTRADA por traspaso','Plaza del Audio','AG GLASS','ANILLO','20 piezas','Foto del registro en sistema'])assert.ok(html.includes(text));
    assert.equal(f.requests.length,1);
});
test('stale or inaccessible transfer fails safely without opening a confirmation panel',async()=>{
    const f=queueFixture(false);await walk(f.render()).find(n=>n.type==='button').props.onClick();
    const html=renderToStaticMarkup(f.render());assert.match(html,/ya no está pendiente/);assert.doesNotMatch(html,/Ya registré estas cantidades/);
});
