import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    return mod.exports;
}
function fixture({status='CLOSED',registered=null,permission=true,quantity=15,channel='MERCADO_LIBRE',type='FULL'}={}){
    const controls=[];
    const Summary=load('app/(app)/salidas/[id]/exit-summary.tsx',{
        './exit-summary.css':{},'../../registros/registration-queue':{default:props=>{controls.push(props);return React.createElement('button',null,props.buttonLabel)}},
    }).default;
    const Editor=load('app/(app)/salidas/[id]/exit-editor.tsx',{'./exit-summary':{default:Summary},'../../registration-access':{useRegistrationAccess:()=>permission}}).default;
    const movement={id:'exit',folio:'SAL-FIXTURE',branch_id:'plaza',branch:'Plaza del Audio',status,pos_registered_at:registered,current_version:1,channel,exit_type:type};
    const lines=[{id:'one',productId:'p1',product:'AG GLASS',quantity},{id:'two',productId:'p2',product:'ANILLO USO RUDO',quantity:20}];
    return {html:renderToStaticMarkup(React.createElement(Editor,{movement,lines,products:[],role:'MASTER'})),controls};
}
test('closed exits show branch title, channel/type, each product and total once, with collapsed folio',()=>{
    const {html,controls}=fixture();
    assert.match(html,/<h1>PLAZA DEL AUDIO<\/h1>/);assert.match(html,/Mercado Libre/);assert.match(html,/Full/);
    assert.match(html,/AG GLASS/);assert.match(html,/ANILLO USO RUDO/);assert.match(html,/35 piezas/);
    assert.equal((html.match(/<li>/g)||[]).length,2);assert.match(html,/>15<\/strong>/);assert.match(html,/>20<\/strong>/);
    assert.match(html,/<details[^>]*><summary>Ver detalles<\/summary><p>Folio: SAL-FIXTURE/);
    assert.doesNotMatch(html,/PASO FINAL|RESUMEN DE SALIDA|<h1>SAL-|La captura ya está cerrada/);
    assert.equal(controls.length,1);assert.equal(controls[0].compact,true);assert.equal(controls[0].buttonLabel,'Confirmar salida registrada');
    assert.equal(controls[0].rows[0].kind,'EXIT');assert.equal(controls[0].rows[0].branch_id,'plaza');assert.equal(controls[0].rows[0].side,null);
});
test('special permission is required and corrections retain their distinct confirmation',()=>{
    assert.equal(fixture({permission:false}).controls.length,0);
    const correction=fixture({status:'POS_CORRECTION_PENDING',registered:'previous'});
    assert.equal(correction.controls[0].rows[0].correction,true);assert.match(correction.html,/Corrección pendiente/);assert.match(correction.html,/Confirmar corrección registrada/);
});
test('registered, cancelled and unknown exit states never expose another confirmation',()=>{
    for(const status of ['POS_REGISTERED','POS_RECONCILED','CANCELLED','UNKNOWN'])assert.equal(fixture({status}).controls.length,0);
    assert.equal(fixture({registered:'done'}).controls.length,0);
    assert.match(fixture({status:'CANCELLED'}).html,/Salida cancelada/);
    assert.match(fixture({status:'POS_REGISTERED',registered:'done'}).html,/Salida registrada/);
});
test('draft capture stays editable with close action and does not use the registration summary',()=>{
    const {html,controls}=fixture({status:'DRAFT'});assert.match(html,/Agregar producto/);assert.match(html,/Cerrar salida/);assert.doesNotMatch(html,/exitSummaryCompact/);assert.equal(controls.length,0);
});
test('alternate channels and types remain identifiable, while missing quantities are not shown as zero',()=>{
    const alternate=fixture({channel:'TIKTOK',type:'INDEPENDENT_SALE'});assert.match(alternate.html,/TikTok/);assert.match(alternate.html,/Venta independiente/);
    const invalid=fixture({quantity:null});assert.match(invalid.html,/Sin cantidad/);assert.match(invalid.html,/Por completar/);
});
