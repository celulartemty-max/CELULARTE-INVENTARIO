import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript'),XLSX=require('xlsx');
function load(path,mocks={}){const m={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'})')(n=>n in mocks?mocks[n]:n.startsWith('./')?load('lib/inventory/'+n.slice(2)+'.ts'):require(n),m,m.exports);return m.exports;}
const parse=load('lib/inventory/packing-excel.ts').readPackingExcel;
function file(rows,{merge=[],second=false}={}){const w=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet(rows);s['!merges']=merge;XLSX.utils.book_append_sheet(w,s,'PER AIR');if(second)XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Other branch']]),'JAPS');return XLSX.write(w,{type:'buffer',bookType:'xlsx'});}
const header=['CTN','MODEL','18 · Negro','NEW 3 · Gris claro','Quantity','CTN TOTAL','KG','CM'];
test('matrix expands exact colour columns, carries carton continuations and checks row/carton/grand totals',()=>{
 const p=parse(file([header,[1,'A',40,10,50,50,23,'73*49*39'],[2,'B',20,null,20,35],[null,'C',null,15,15],['TOTAL',null,null,null,85,85]]));
 assert.deepEqual(p.colors,['18 · Negro','NEW 3 · Gris claro']);assert.deepEqual(p.boxes.map(b=>b.number),['1','2']);assert.equal(p.boxes[1].items.length,2);assert.equal(p.boxes.flatMap(b=>b.items).reduce((s,i)=>s+i.expected,0),85);assert.equal(p.boxes[0].items[0].model,'A');
});
test('merged carton values apply to the full range without manufacturing duplicate boxes',()=>{
 const p=parse(file([header,[1,'A',5,null,5,10],[null,'B',null,5,5]],{merge:[{s:{r:1,c:0},e:{r:2,c:0}}]}));assert.equal(p.boxes.length,1);assert.equal(p.boxes[0].items.length,2);
});
test('long format, repeated model in separate cartons and explicit zero stay exact',()=>{
 const p=parse(file([['CAJA','MODELO','COLOR','CANTIDAD'],[1,'A','Negro',0],[2,'A','Negro','12'],[2,'B','Rosa',3]]));assert.equal(p.boxes.length,2);assert.equal(p.boxes[0].items[0].expected,0);assert.equal(p.boxes[1].items[0].expected,12);assert.deepEqual(p.colors,['Negro','Rosa']);
});
test('actual duplicate pairs are rejected, never summed or dropped; same code is not discarded',()=>{
 assert.throws(()=>parse(file([header,[1,'A',5,null,5],[null,'a',5,null,5]])),/realmente repetido/);
 assert.throws(()=>parse(file([['CTN','MODEL','Negro','NEGRO','Quantity'],[1,'A',5,5,10]])),/color repetidas/);
 const p=parse(file([['CTN','MODEL','6 · Rosa','48 · Rosa intenso','Quantity'],[1,'A',5,10,15]]));assert.equal(p.boxes[0].items.length,2);
});
test('bad quantities, row totals, carton totals and grand totals fail closed',()=>{
 for(const value of [-1,1.5,'unknown','1,000',true])assert.throws(()=>parse(file([header,[1,'A',value,null,5]])),/Cantidad inválida/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,10]])),/total de la fila/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5,10]])),/total/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5],['TOTAL',null,null,null,10]])),/total general/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5],[null,null,5,null,5]])),/Falta modelo/);
 assert.throws(()=>parse(file([['CTN','MODEL','Negro','Quantity','Total'],[1,'A',5,5,10]])),/ambiguos/);
});
test('multiple branches, unidentified columns, unknown layouts and data after total require review',()=>{
 assert.throws(()=>parse(file([header,[1,'A',5,null,5]],{second:true})),/una sola hoja/);
 assert.throws(()=>parse(file([['SKU','QTY'],['A',5]])),/No se reconoció/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5,null,null,null,999]])),/sin encabezado/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5],['TOTAL',null,null,null,5],[2,'B',5,null,5]])),/después del total/);
});
test('Excel route returns before OpenAI key, usage limits, network or database writes; permission remains required',async()=>{
 const user={id:'operator'};const calls=[];
 const mod=load('app/api/receiving/interpret/route.ts',{'@/lib/audit/route':{auditRoute:f=>f},'@/lib/auth/authorization':{requireUser:async()=>{calls.push('user');return user}},'@/lib/inventory/receiving':{receivingAccess:async(u,review)=>{assert.equal(u,user);assert.equal(review,true);calls.push('permission')}},'@/lib/inventory/receiving-files':{readReceivingFile:async()=>({data:file([header,[1,'A',5,null,5]]),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})},'@/lib/inventory/packing-excel':{readPackingExcel:parse},'@/lib/inventory/packing-reading':{},'@/lib/db':{withTransaction:()=>{throw Error('Database must not be called')}}});
 const form=new FormData();form.set('file',new File(['fixture'],'packing.xlsx'));const response=await mod.POST(new Request('http://localhost/api/receiving/interpret',{method:'POST',body:form}));assert.equal(response.status,200);const p=await response.json();assert.equal(p.boxes[0].items[0].expected,5);assert.deepEqual(calls,['user','permission']);
});
