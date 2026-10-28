import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path) {
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    vm.runInThisContext('(function(require,module,exports){'+code+'})')(name=>name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(posix.join(posix.dirname(path),name+'.ts')):require(name),mod,mod.exports);
    return mod.exports;
}
const helpers=load('lib/inventory/packing-column-order.ts');
const Grid=load('app/(app)/entradas/pedidos/[id]/count-grid.tsx').default;
const review=load('app/(app)/entradas/pedidos/[id]/packing-review.tsx');
const packing={reference:'PEDIDO',colors:['NEGRO','AZUL','ROSA'],warnings:[],boxes:[{number:'1',items:[{model:'A',color:'AZUL',expected:5},{model:'B',color:'NEGRO',expected:10},{model:'B',color:'ROSA',expected:0}]}]};
test('column order follows explicit header even when the first model has missing colours',()=>{
    assert.deepEqual(Array.from(helpers.orderedPackingColors(['AZUL','NEGRO','ROSA'],packing.colors)),['NEGRO','AZUL','ROSA']);
    assert.deepEqual(Array.from(review.boxGrid(packing.boxes[0],packing.colors).colors),['NEGRO','AZUL','ROSA']);
});
test('extra colours append at the end without adding unused global columns or mutating inputs',()=>{
    const actual=['AZUL','VERDE','NEGRO','AZUL'];const preferred=['NEGRO','AZUL','ROSA'];
    assert.deepEqual(Array.from(helpers.orderedPackingColors(actual,preferred)),['NEGRO','AZUL','VERDE']);
    assert.deepEqual(actual,['AZUL','VERDE','NEGRO','AZUL']);assert.deepEqual(preferred,['NEGRO','AZUL','ROSA']);
    assert.deepEqual(Array.from(helpers.orderedPackingColors(['','AZUL','AZUL'])),['','AZUL']);
});
test('metadata keeps all original headers for future arrivals; labels normalize without sorting',()=>{
    const p={...packing,colors:[' negro ','Azul','ROSA'],boxes:[{number:'1',items:[{color:'azul'},{color:'verde'}]}]};
    assert.deepEqual(Array.from(helpers.packingColorOrder(p)),['NEGRO','AZUL','ROSA','VERDE']);
});
test('schema preserves explicit column order and accepts older packings without metadata',()=>{
    const {packingSchema}=load('lib/inventory/receiving-validation.ts');
    assert.deepEqual(Array.from(packingSchema.parse(packing).colors),packing.colors);
    const old={reference:packing.reference,warnings:packing.warnings,boxes:packing.boxes};assert.equal(packingSchema.parse(old).colors,undefined);
    assert.equal(packingSchema.safeParse({...packing,colors:Array(501).fill('NEGRO')}).success,false);
});
test('partial imports preserve the first packing order and append new colours transactionally',async()=>{
    const queries=[];const c={query:async(sql,args)=>{queries.push({sql,args});return {rows:[{color_order:['NEGRO','AZUL','ROSA']}]}}};
    await helpers.savePackingColorOrder(c,'ORDER',{colors:['AZUL','NEGRO','VERDE'],boxes:[]});
    assert.deepEqual(Array.from(queries[1].args[0]),['NEGRO','AZUL','ROSA','VERDE']);assert.match(queries[0].sql,/FOR UPDATE/);
    assert.equal(queries.some(q=>/receiving_items/.test(q.sql)),false);
    await helpers.appendPackingColor(c,'ORDER','AMARILLO');assert.deepEqual(Array.from(queries[3].args[0]),['NEGRO','AZUL','ROSA','AMARILLO']);
});
test('adding a colour to a legacy order keeps old columns ahead of the new one',async()=>{
    const queries=[];const c={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT color_order')?[{color_order:[]}]:[{color:'AZUL'},{color:'NEGRO'}]}}};
    await helpers.appendPackingColor(c,'ORDER','AMARILLO');assert.deepEqual(Array.from(queries[2].args[0]),['AZUL','NEGRO','AMARILLO']);
});
test('counting headers use packing positions while null, real zero and missing combinations remain distinct',()=>{
    const items=[{id:'a',model:'A',color:'AZUL',counted:null},{id:'b',model:'B',color:'NEGRO',counted:0},{id:'c',model:'B',color:'ROSA',counted:8}];
    const html=renderToStaticMarkup(React.createElement(Grid,{items,colorOrder:packing.colors,disabled:false,showReference:false}));
    assert.ok(html.indexOf('>NEGRO</th>')<html.indexOf('>AZUL</th>'));assert.ok(html.indexOf('>AZUL</th>')<html.indexOf('>ROSA</th>'));
    assert.match(html,/<input(?=[^>]*name="a")(?=[^>]*placeholder="Sin contar")/);assert.match(html,/name="b"[^>]*value="0"/);assert.match(html,/Combinación no incluida/);
});
test('Excel count view uses the same columns and retains blank, zero and absent cells without changing source',async()=>{
    const {addPackingCountSheet}=load('lib/inventory/packing-sheet-export.ts');
    const boxes=[{id:'1',reference:'PEDIDO',product:'COMBO',carton_number:'1',color_order:packing.colors}];
    const items=[{carton_id:'1',model:'A',color:'AZUL',counted:null},{carton_id:'1',model:'B',color:'NEGRO',counted:0},{carton_id:'1',model:'B',color:'ROSA',counted:8}];
    const before=JSON.stringify(items);const workbook=new ExcelJS.Workbook();const sheet=addPackingCountSheet(workbook,boxes,items);
    assert.deepEqual(sheet.getRow(2).values.slice(1),['Modelo / Color','NEGRO','AZUL','ROSA']);
    assert.equal(sheet.getCell('B3').value,'—');assert.equal(sheet.getCell('C3').value,null);assert.equal(sheet.getCell('B4').value,0);assert.equal(sheet.getCell('D4').value,8);
    assert.equal(JSON.stringify(items),before);
    // Verify exported serialization in memory; no business files or quantities are changed.
    const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    assert.deepEqual(loaded.getWorksheet('Conteo por caja').getRow(2).values.slice(1),['Modelo / Color','NEGRO','AZUL','ROSA']);
});
test('interpretation explicitly requests left-to-right header order and consistent translations',()=>{
    const prompt=readFileSync(new URL('../app/api/receiving/interpret/route.ts',import.meta.url),'utf8');
    assert.match(prompt,/colors:string\[\]/);assert.match(prompt,/izquierda a derecha/);assert.match(prompt,/nunca alfabético/);assert.match(prompt,/misma etiqueta/);
    const migration=readFileSync(new URL('../migrations/20261028_packing_column_order.sql',import.meta.url),'utf8');
    assert.match(migration,/ADD COLUMN IF NOT EXISTS color_order/);assert.doesNotMatch(migration,/UPDATE|DELETE|DROP/);
});
