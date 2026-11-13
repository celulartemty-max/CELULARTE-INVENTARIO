import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path){const m={exports:{}};vm.runInThisContext('(function(require,module,exports){'+ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(n=>n.startsWith('./')?load('lib/inventory/'+n.slice(2)+'.ts'):require(n),m,m.exports);return m.exports;}
const {validateMixedPacking}=load('lib/inventory/mixed-packing.ts');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const packing={boxes:[{number:'19',items:[{model:'IP16',color:'',expected:50,productId:a,productLabel:'CLEAR'},{model:'IP16',color:'',expected:150,productId:b,productLabel:'PRIVACY'}]}]};
test('mixed approval requires active mapped products and disallows duplicates after mapping',async()=>{
 const calls=[];const c={query:async(sql,args)=>{calls.push([sql,args]);return {rows:sql.startsWith('SELECT')?[{id:a},{id:b}]:[],rowCount:1}}};
 await validateMixedPacking(c,packing,'order');assert.equal(calls.length,2);assert.match(calls[1][0],/is_mixed=true/);
 const unmapped=structuredClone(packing);delete unmapped.boxes[0].items[0].productId;await assert.rejects(()=>validateMixedPacking(c,unmapped,'order'),/Asigna/);
 const duplicate=structuredClone(packing);duplicate.boxes[0].items[1].productId=a;await assert.rejects(()=>validateMixedPacking({...c,query:async()=>({rows:[{id:a}],rowCount:1})},duplicate,'order'),/repetido/);
 await assert.rejects(()=>validateMixedPacking({...c,query:async()=>({rows:[],rowCount:0})},packing,'order'),/inactivo/);
});
test('mixed carton export preserves both products with identical model and colour',()=>{
 const ExcelJS=require('exceljs'),w=new ExcelJS.Workbook();
 const s=load('lib/inventory/packing-sheet-export.ts').addPackingCountSheet(w,[{id:'box',reference:'MIX',product:'Mixto',carton_number:'19'}],packing.boxes[0].items.map(l=>({carton_id:'box',model:l.model,color:l.color,counted:l.expected,product_id:l.productId,product_label:l.productLabel})));
 const values=[];s.eachRow(r=>values.push(r.values));const flat=JSON.stringify(values);assert.match(flat,/CLEAR/);assert.match(flat,/PRIVACY/);assert.ok(values.some(r=>r.includes(50)));assert.ok(values.some(r=>r.includes(150)));
});
test('large photo-heavy workbook becomes a small data copy without changing original',async()=>{
 const XLSX=require('xlsx'),JSZip=require('jszip'),w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['CTN','MODEL','BLACK','Quantity'],[1,'IP16',50,50]]),'Packing');
 const zip=await JSZip.loadAsync(XLSX.write(w,{type:'buffer',bookType:'xlsx'}));zip.file('xl/media/image1.png',new Uint8Array(3*1024*1024));const bytes=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 const original=new File([bytes],'original.xlsx');const copy=await load('lib/inventory/packing-upload-file.ts').preparePackingUpload(original);
 assert.equal(original.size,bytes.length);assert.equal(original.name,'original.xlsx');assert.equal(copy.name,'original-lectura.xlsx');assert.ok(copy.size<2*1024*1024);
 const read=XLSX.read(await copy.arrayBuffer(),{type:'array'});assert.equal(read.Sheets.Packing.C2.v,50);
});
