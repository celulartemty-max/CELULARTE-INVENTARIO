import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('lib/inventory/tiktok-sku-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>{assert.equal(n,'jszip');return JSZip;}});
const {exportTikTokSkus:run}=module.exports;
const cell=(ref,v)=>'<c r="'+ref+'" t="inlineStr"><is><t>'+v+'</t></is></c>';
async function fixture(rows,target='worksheets/sheet1.xml'){
 const z=new JSZip();
 z.file('xl/workbook.xml','<workbook><sheets><sheet name="Template" r:id="rId1"/></sheets></workbook>');
 z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="'+target+'"/></Relationships>');
 z.file('xl/styles.xml','DO NOT CHANGE');
 z.file('xl/worksheets/other.xml','OTHER SHEET');
 z.file('custom/data.xml','CUSTOM DATA');
 z.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="3">'+cell('B3','ID de SKU')+cell('F3','SKU de vendedor')+'</row>'+rows+'</sheetData></worksheet>');
 return z.generateAsync({type:'uint8array'});
}
const entry=(id,sku)=>({tiktok_sku_id:id,seller_sku:sku});
test('writes 135 SKUs by exact long ID, preserves all unrelated package entries and style',async()=>{
 const assignments=Array.from({length:135},(_,i)=>entry('123456789012345'+String(i).padStart(3,'0'),'NEW'+i));
 const rows=assignments.map((x,i)=>'<row r="'+(i+4)+'">'+cell('B'+(i+4),x.tiktok_sku_id)+(i%3===0?'<c r="F'+(i+4)+'" s="7"/>':i%3===1?cell('F'+(i+4),'OLD'):'')+cell('J'+(i+4),'PRICE-STOCK-UNCHANGED')+'</row>').join('');
 const original=await fixture(rows),result=await run(original,assignments);
 assert.equal(result.updated,135);assert.equal(result.verified,135);
 const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(result.output);
 for(const name of Object.keys(before.files)){if(name==='xl/worksheets/sheet1.xml')continue;assert.equal(await after.file(name)?.async('string'),await before.file(name)?.async('string'));}
 const xml=await after.file('xl/worksheets/sheet1.xml').async('string');
 assert.match(xml,/<c r="F4" s="7" t="inlineStr">/);
 for(let i=0;i<135;i++){assert.ok(xml.includes(cell('F'+(i+4),assignments[i].seller_sku))||i%3===0);assert.ok(xml.includes(cell('J'+(i+4),'PRICE-STOCK-UNCHANGED')));}
 assert.ok(xml.indexOf('r="F6"')<xml.indexOf('r="J6"'));
 const again=await run(result.output,assignments);assert.equal(again.updated,0);assert.deepEqual(again.output,result.output);
});
test('supports rooted relationships and escapes SKU XML',async()=>{
 for(const target of ['/xl/worksheets/sheet1.xml','xl/worksheets/sheet1.xml']){
 const r=await run(await fixture('<row r="4">'+cell('B4','123')+'</row>',target),[entry('123','A&B<Z')]);
 assert.match(await (await JSZip.loadAsync(r.output)).file('xl/worksheets/sheet1.xml').async('string'),/A&amp;B&lt;Z/);
 }
});
test('refuses missing, conflicting, duplicate or unassigned variants',async()=>{
 const row='<row r="4">'+cell('B4','123')+'</row>',original=await fixture(row);
 await assert.rejects(run(original,[entry('456','ABC')]),/no tiene SKU/);
 await assert.rejects(run(original,[entry('123','ABC'),entry('456','DEF')]),/no se encontraron/);
 await assert.rejects(run(original,[entry('123','ABC'),entry('123','DEF')]),/contradictorias/);
 await assert.rejects(run(await fixture(row+row.replaceAll('4','5')),[entry('123','ABC')]),/más de una vez/);
 await assert.rejects(run(original,[]),/No hay SKU/);
});
