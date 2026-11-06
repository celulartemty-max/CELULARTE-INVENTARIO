import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../app/(app)/registros/registration-detail.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};
vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(require,mod,mod.exports);
const {default:Detail,registrationInstruction:instruction,registrationQuantities:quantities,registrationConfirmLabel:confirmLabel}=mod.exports;
const row={kind:'EXIT',side:null,correction:false,branch:'Plaza del Audio',reference:'SAL-FIXTURE'};
test('receipt groups quantities by product and counts distinct carton IDs, retaining the breakdown',()=>{
 const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row:{...row,kind:'RECEIVING'},lines:[{product_id:'p',product:'LENS',carton_id:'a',box:'1',color:'BLACK',quantity:300},{product_id:'p',product:'LENS',carton_id:'a',box:'1',color:'RED',quantity:300},{product_id:'p',product:'LENS',carton_id:'b',box:'1',quantity:150},{product_id:'q',product:'WALLET',carton_id:'c',box:'2',quantity:330}]}}));
 assert.match(html,/# Cajas/);assert.match(html,/# Piezas/);assert.match(html,/>750<\/strong>/);assert.match(html,/>330<\/strong>/);assert.match(html,/Total · 3 cajas/);assert.match(html,/1,080 piezas/);
 const summary=html.split('<details')[0];assert.equal((summary.match(/>LENS<\/b>/g)||[]).length,1);assert.doesNotMatch(summary,/BLACK/);assert.match(html.split('<details')[1],/BLACK/);
});
test('receipt with an incomplete quantity does not show a false product total',()=>{
 const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row:{...row,kind:'DESTINATION'},lines:[{product:'LENS',box:'1',quantity:null}]}}));assert.match(html,/Por completar/);assert.match(html,/role="alert"/);
});
test('instructions distinguish receipt, exit, return and both transfer sides',()=>{
    for(const kind of ['RECEIVING','DESTINATION','RECEPTION'])assert.equal(instruction({...row,kind}),'Registrar una ENTRADA');
    assert.equal(instruction(row),'Registrar una SALIDA');
    for(const kind of ['RETURN_ML','RETURN_TIKTOK','RETURN_CUSTOMER'])assert.equal(instruction({...row,kind}),'Registrar una DEVOLUCIÓN');
    assert.equal(instruction({...row,kind:'TRANSFER',side:'origin'}),'Registrar una SALIDA por traspaso');
    assert.equal(instruction({...row,kind:'TRANSFER',side:'destination'}),'Registrar una ENTRADA por traspaso');
});
test('confirmation displays operation, branch, real per-product amounts and total without a wide table',()=>{
    const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row,lines:[{product:'AG GLASS',quantity:15},{product:'ANILLO USO RUDO',quantity:20}]}}));
    for(const text of ['Salida','Plaza del Audio','AG GLASS','ANILLO USO RUDO','35 piezas'])assert.ok(html.includes(text));
    assert.match(html,/>15<\/strong>/);assert.match(html,/>20<\/strong>/);assert.doesNotMatch(html,/<table/);
    assert.doesNotMatch(html,/QUÉ VAS A REGISTRAR|Total a registrar|registrationMovement/);
    assert.match(html,/<summary>Ver detalles<\/summary>/);
});
test('confirmation labels explain entry, exit, return and correction without repeating long instructions',()=>{
    assert.equal(confirmLabel(row),'Confirmar salida registrada');
    assert.equal(confirmLabel({...row,kind:'TRANSFER',side:'origin'}),'Confirmar salida registrada');
    assert.equal(confirmLabel({...row,kind:'TRANSFER',side:'destination'}),'Confirmar entrada registrada');
    assert.equal(confirmLabel({...row,kind:'RECEIVING'}),'Confirmar entrada registrada');
    assert.equal(confirmLabel({...row,kind:'RETURN_ML'}),'Confirmar devolución registrada');
    assert.equal(confirmLabel({...row,correction:true}),'Confirmar corrección registrada');
});
test('model, colour, carton and damage status stay visible when captured',()=>{
    const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row,lines:[{product:'FUNDA',model:'SAM A06',color:'AZUL',box:'2',condition:'DAMAGED',quantity:0}]}}));
    for(const text of ['SAM A06','AZUL','Caja 2','Dañado','0 piezas'])assert.ok(html.includes(text));
    assert.equal(quantities([{quantity:0}]).complete,true);
});
test('missing and invalid quantities never become a misleading zero total',()=>{
    for(const lines of [[],[{}],[{quantity:null}],[{quantity:NaN}],[{quantity:-1}],[{quantity:1.5}]]){
        assert.equal(quantities(lines).complete,false);assert.equal(quantities(lines).total,null);
    }
    const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row,lines:[{product:'AG GLASS'}]}}));
    assert.match(html,/Por completar/);assert.match(html,/Sin cantidad/);assert.match(html,/role="alert"/);
});
test('corrections identify final quantities instead of suggesting a duplicate movement',()=>{
    const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row:{...row,correction:true},lines:[{quantity:5}]}}));
    assert.match(html,/no dupliques el movimiento/);
});
test('queue preserves permission workflow and blocks incomplete confirmation without requesting photos',()=>{
    const queue=readFileSync(new URL('../app/(app)/registros/registration-queue.tsx',import.meta.url),'utf8');
    assert.match(queue,/<RegistrationDetail detail=\{detail\}/);assert.match(queue,/!registrationQuantities\(detail.lines\).complete/);assert.doesNotMatch(queue,/Foto del registro en sistema|\/api\/pos-evidence|capture=/);assert.match(queue,/\/api\/system-registration/);
});
