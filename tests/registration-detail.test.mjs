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
const {default:Detail,registrationInstruction:instruction,registrationQuantities:quantities}=mod.exports;
const row={kind:'EXIT',side:null,correction:false,branch:'Plaza del Audio',reference:'SAL-FIXTURE'};
test('instructions distinguish receipt, exit, return and both transfer sides',()=>{
    for(const kind of ['RECEIVING','DESTINATION','RECEPTION'])assert.equal(instruction({...row,kind}),'Registrar una ENTRADA');
    assert.equal(instruction(row),'Registrar una SALIDA');
    for(const kind of ['RETURN_ML','RETURN_TIKTOK','RETURN_CUSTOMER'])assert.equal(instruction({...row,kind}),'Registrar una DEVOLUCIÓN');
    assert.equal(instruction({...row,kind:'TRANSFER',side:'origin'}),'Registrar una SALIDA por traspaso');
    assert.equal(instruction({...row,kind:'TRANSFER',side:'destination'}),'Registrar una ENTRADA por traspaso');
});
test('confirmation displays operation, branch, real per-product amounts and total without a wide table',()=>{
    const html=renderToStaticMarkup(React.createElement(Detail,{detail:{row,lines:[{product:'AG GLASS',quantity:15},{product:'ANILLO USO RUDO',quantity:20}]}}));
    for(const text of ['Registrar una SALIDA','Plaza del Audio','AG GLASS','ANILLO USO RUDO','35 piezas'])assert.ok(html.includes(text));
    assert.match(html,/>15<\/strong>/);assert.match(html,/>20<\/strong>/);assert.doesNotMatch(html,/<table/);
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
test('queue preserves photo and permission workflow but blocks incomplete confirmation',()=>{
    const queue=readFileSync(new URL('../app/(app)/registros/registration-queue.tsx',import.meta.url),'utf8');
    assert.match(queue,/<RegistrationDetail detail=\{detail\}/);assert.match(queue,/!registrationQuantities\(detail.lines\).complete/);assert.match(queue,/Foto del registro en sistema/);assert.match(queue,/\/api\/system-registration/);
});
