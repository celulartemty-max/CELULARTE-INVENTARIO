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
test('bilingual Material colours preserve Chinese shade distinctions, compound names and qualifiers',()=>{
 const shades=['BLACK黑色','SILVER银色','BLUE蓝色','PINK粉色','GOLD金色','GOLD沙漠色','TITANIUM GREY钛灰','TITANIUM GREY钛原','SILVER银色(白)','TEAL深青色','BLUE群青','DARK CHERRY深樱桃色','ORANGE橙色'];
 const h=['Carton No','Material','Photo','Brand','Model','Quantity',null];
 const merge=[{s:{r:0,c:5},e:{r:0,c:6}}];
 const rows=[h,...shades.map((color,i)=>[1,'CD camera lens with package-'+color,null,'Apple','IP 16',50,i===0?shades.length*50:null]),['Total',null,null,null,null,shades.length*50,shades.length*50]];
 const p=parse(file(rows,{merge}));assert.deepEqual(p.colors,shades);assert.equal(p.boxes[0].items.length,shades.length);
 for(const bad of ['BLACK123','unknown','BLACK黑色 extra'])assert.throws(()=>parse(file([h,[1,'Lens-'+bad,null,'Apple','IP 16',50,50]],{merge})),/identificar el color/);
 const duplicate=[h,[1,'Lens-BLACK黑色',null,'Apple','IP 16',50,100],[1,'Lens-BLACK黑色',null,'Apple','IP 16',50]];assert.throws(()=>parse(file(duplicate,{merge})),/realmente repetido/);
});
test('offset supplier table reads merged Quantity as detail/carton controls and Material suffix as colour',()=>{
 const h=[null,'Carton No.','Material','Photo','Brand','Model','Quantity',null,'Weight','Width*Length*Height','CBM'];
 const merge=[{s:{r:2,c:6},e:{r:2,c:7}},{s:{r:3,c:1},e:{r:4,c:1}},{s:{r:3,c:7},e:{r:4,c:7}}];
 const rows=[[],[null,'JAPS SEA'],h,[null,1,'Privacy glass with package-Black',null,'Apple','IPHONE 11',250,500,18,'60*45*33',.0891],[null,null,'Privacy glass with package-Black',null,'Apple','IPHONE 18 PRO',250],[null,2,'Privacy glass with package-White',null,'Apple','IPHONE 16',300,300],[null,'Total',null,null,null,null,800,800]];
 const p=parse(file(rows,{merge}));assert.deepEqual(p.colors,['Black','White']);assert.deepEqual(p.boxes.map(b=>b.items.reduce((s,i)=>s+i.expected,0)),[500,300]);assert.equal(p.boxes[0].items[1].model,'IPHONE 18 PRO');
 const bad=structuredClone(rows);bad[3][7]=499;assert.throws(()=>parse(file(bad,{merge})),/caja 1.*500.*499/);
 const grand=structuredClone(rows);grand.at(-1)[6]=799;assert.throws(()=>parse(file(grand,{merge})),/totales generales/);
 const unknown=structuredClone(rows);unknown[3][2]='Privacy glass';assert.throws(()=>parse(file(unknown,{merge})),/Material.*fila 4/);
 assert.throws(()=>parse(file(rows,{merge:merge.slice(1)})),/sin encabezado.*fila 4/);
});
test('offset wide-colour headers preserve absolute merge coordinates and error row numbers',()=>{
 const rows=[[],[null,'Packing'],[null,'CTN','MODEL','BLACK','Quantity','Total'],[null,1,'A',5,5,10],[null,null,'B',5,5], [null,'Total',null,10,10,10]];
 const merge=[{s:{r:3,c:1},e:{r:4,c:1}},{s:{r:3,c:5},e:{r:4,c:5}}];
 const p=parse(file(rows,{merge}));assert.equal(p.boxes.length,1);assert.deepEqual(p.boxes[0].items.map(i=>i.model),['A','B']);
 const bad=structuredClone(rows);bad[4][4]=6;assert.throws(()=>parse(file(bad,{merge})),/fila 5/);
});
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
test('colour-only accessory packing reads Carton No without inventing a phone model or treating logistics as colours',()=>{
 const h=['Carton No','#1 NUDE','#2 ROSE','#3 SKY BLUE','#4 ROSE PINK','#5 NAVY','#6 WHITE','#7 PURPLE','#8 YELLOW','#9 ORANGE','#10 BLACK','quantity','weight/kg','size/cm','cbm'];
 const p=parse(file([['POP SOCKET MAGSAFE PER By Air'],[],h,[1,100,200,100,100,null,null,null,null,null,null,500,17,'51*41*30',0.06273],[2,null,null,null,null,150,150,200,null,null,null,500,17,'51*41*30',0.06273],[3,null,null,null,null,null,null,null,100,50,250,400,13,'51*41*30',0.06273],[null,null,null,null,null,null,null,null,null,null,null,1400,47,null,0.18819]]));
 assert.deepEqual(p.boxes.map(b=>b.items.reduce((s,i)=>s+i.expected,0)),[500,500,400]);assert.equal(p.colors.length,10);assert.equal(p.boxes.flatMap(b=>b.items).length,10);assert.ok(p.boxes.every(b=>b.items.every(i=>i.model==='')));assert.equal(p.colors.at(-1),'#10 BLACK');
});
test('optional MODEL applies only to tables without that column; missing models and wrong accessory totals still fail',()=>{
 assert.throws(()=>parse(file([header,[1,null,5,null,5]])),/Falta/);
 assert.throws(()=>parse(file([['Carton No','Negro','Quantity'],[1,5,10]])),/total de la fila/);
 assert.throws(()=>parse(file([['Carton No','Negro','Quantity'],[1,5,5],[null,null,10]])),/total general/);
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
 assert.throws(()=>parse(file([['CTN','MODEL','Negro','Quantity','Total'],[1,'A',5,5,10]])),/total de caja/);
});
test('multiple branches, unidentified columns, unknown layouts and data after total require review',()=>{
 assert.throws(()=>parse(file([header,[1,'A',5,null,5]],{second:true})),/una sola hoja/);
 assert.throws(()=>parse(file([['SKU','QTY'],['A',5]])),/No se reconoció/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5,null,null,null,999]])),/sin encabezado/);
 assert.throws(()=>parse(file([header,[1,'A',5,null,5],['TOTAL',null,null,null,5],[2,'B',5,null,5]])),/después del total/);
});
test('single-colour quantity header and vertically merged Total reconcile whole cartons, not individual models',()=>{
 const h=['Carton No','Model','clear/quantity','total','weight/kg'];
 const merge=[{s:{r:1,c:0},e:{r:2,c:0}},{s:{r:1,c:3},e:{r:2,c:3}}];
 const p=parse(file([h,[1,'iPh 13',350,600,15.12],[null,'iPh 15',250],[2,'iPh 17',500,500],[null,null,1100,1100]],{merge}));
 assert.deepEqual(p.colors,['clear']);assert.deepEqual(p.boxes.map(b=>b.items.reduce((s,i)=>s+i.expected,0)),[600,500]);
 assert.throws(()=>parse(file([h,[1,'A',350,601],[null,'B',250]],{merge})),/total de caja indica 601/);
 assert.throws(()=>parse(file([h,[1,'A',350,350],[2,'B',250]],{merge:[{s:{r:1,c:3},e:{r:2,c:3}}]})),/distintas cajas/);
 assert.throws(()=>parse(file([h,[1,'A',350,600],[null,'B',250],[null,null,599,600]],{merge})),/total general/);
});
test('merged logistics headers cover separate dimension cells; model-only catalogue after a verified total is excluded with a warning',()=>{
 const h=['Carton No','Model','BLACK','Quantity','Total','size/cm',null,null,'cbm'];
 const merge=[{s:{r:0,c:5},e:{r:0,c:7}}];
 const rows=[h,[1,'IPAD',50,50,50,55,35,42,.081],[null,null,null,50,50], [null,'IPAD catalogue only']];
 const p=parse(file(rows,{merge}));assert.deepEqual(p.colors,['BLACK']);assert.equal(p.boxes.length,1);assert.equal(p.boxes[0].items[0].expected,50);assert.match(p.warnings[0],/1 referencias sin cantidades/);
 assert.throws(()=>parse(file(rows)),/sin encabezado/);
 const bad=[...rows,[null,'OTHER',10]];assert.throws(()=>parse(file(bad,{merge})),/después del total general/);
 const before=[h,[null,'catalogue'],[1,'IPAD',50,50,50,55,35,42,.081]];assert.throws(()=>parse(file(before,{merge})),/Falta caja/);
});
test('isolated text-only notes outside a blank separator are warned, but unnamed quantities remain errors',()=>{
 const h=['CTN','MODEL','BLACK','Quantity'];
 const p=parse(file([h,[1,'A',5,5,null,null,'R']]));assert.equal(p.boxes[0].items[0].expected,5);assert.match(p.warnings[0],/notas de texto.*G/);
 for(const value of [20,'20','R20'])assert.throws(()=>parse(file([h,[1,'A',5,5,null,null,value]])),/sin encabezado/);
 assert.throws(()=>parse(file([h,[1,'A',5,5,'R']])),/sin encabezado/);
});
test('colour subtotal footer with Quantity and Total validates each colour without creating items or a carton',()=>{
 const h=['Carton No','Model','BLACK','CLEAR','Quantity','Total'];
 const rows=[h,[1,'SAM A27',70,50,120,200],[null,'SAM A57',50,30,80],['TOTAL',null,120,80,200,200]];
 const p=parse(file(rows));assert.equal(p.boxes.length,1);assert.equal(p.boxes[0].items.length,4);assert.equal(p.boxes[0].items.reduce((s,i)=>s+i.expected,0),200);
 const wrong=rows.map(r=>[...r]);wrong[3]=[null,null,110,90,200,200];assert.throws(()=>parse(file(wrong)),/total de BLACK indica 110; las cajas suman 120/);
 const incomplete=rows.map(r=>[...r]);incomplete[3]=[null,null,120,80,200,null];assert.throws(()=>parse(file(incomplete)),/Falta modelo/);
});
test('supplier Quantity plus Total distinguishes row and carton controls including merged cells',()=>{
 const p=parse(file([['Carton No.','Model','BLACK','BLUE','quantity','total'],[1,'A',4,1,5,8],[null,'B',3,null,3],['TOTAL',null,null,null,8,8]],{merge:[{s:{r:1,c:0},e:{r:2,c:0}},{s:{r:1,c:5},e:{r:2,c:5}}]}));
 assert.equal(p.boxes.length,1);assert.equal(p.boxes[0].items.reduce((s,i)=>s+i.expected,0),8);
 assert.throws(()=>parse(file([['CTN','MODEL','BLACK','Quantity','Total'],[1,'A',5,5,5],['TOTAL',null,null,5,9]])),/totales generales son distintos/);
});
test('blank or formatting-only sheets are ignored, real sheets require explicit selection and never merge',()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([header,[1,'A',5,null,5]]),'PER');
 XLSX.utils.book_append_sheet(w,{'!ref':'A1:Z9000',A1:{t:'s',v:'  '}},'Vacía');
 const data=()=>XLSX.write(w,{type:'buffer',bookType:'xlsx'});assert.equal(parse(data()).boxes.length,1);
 XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([header,[1,'B',7,null,7]]),'JAPS');
 assert.throws(()=>parse(data()),e=>{assert.deepEqual(e.sheets,['PER','JAPS']);return true});
 assert.equal(parse(data(),'JAPS').boxes[0].items[0].model,'B');assert.equal(parse(data(),'PER').boxes[0].items[0].expected,5);
 assert.throws(()=>parse(data(),'Vacía'),/vacía/);assert.throws(()=>parse(data(),'missing'),/no existe/);
});
test('common localized headers work and reconciliation errors identify the sheet, row and carton',()=>{
 const p=parse(file([['CTN #','MODELO','Rojo','QTY (PCS)'],[1,'A',6,6]]));assert.equal(p.boxes[0].items[0].expected,6);
 assert.throws(()=>parse(file([header,[1,'A',5,null,9]])),/Hoja PER AIR, fila 2, caja 1: colores suman 5; Quantity indica 9/);
});
test('Excel route returns before OpenAI key, usage limits, network or database writes; permission remains required',async()=>{
 const user={id:'operator'};const calls=[];
 const mod=load('app/api/receiving/interpret/route.ts',{'@/lib/audit/route':{auditRoute:f=>f},'@/lib/auth/authorization':{requireUser:async()=>{calls.push('user');return user}},'@/lib/inventory/receiving':{receivingAccess:async(u,review)=>{assert.equal(u,user);assert.equal(review,true);calls.push('permission')}},'@/lib/inventory/receiving-files':{readReceivingFile:async()=>({data:file([header,[1,'A',5,null,5]]),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})},'@/lib/inventory/packing-excel':{readPackingExcel:parse},'@/lib/inventory/packing-reading':{},'@/lib/db':{withTransaction:()=>{throw Error('Database must not be called')}}});
 const form=new FormData();form.set('file',new File(['fixture'],'packing.xlsx'));const response=await mod.POST(new Request('http://localhost/api/receiving/interpret',{method:'POST',body:form}));assert.equal(response.status,200);const p=await response.json();assert.equal(p.boxes[0].items[0].expected,5);assert.deepEqual(calls,['user','permission']);
});
test('route offers sheet selection without importing and forwards the chosen sheet',async()=>{
 const data=file([header,[1,'A',5,null,5]],{second:true});
 const mod=load('app/api/receiving/interpret/route.ts',{'@/lib/audit/route':{auditRoute:f=>f},'@/lib/auth/authorization':{requireUser:async()=>({id:'reviewer'})},'@/lib/inventory/receiving':{receivingAccess:async()=>{}},'@/lib/inventory/receiving-files':{readReceivingFile:async()=>({data,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})},'@/lib/inventory/packing-excel':{readPackingExcel:parse},'@/lib/inventory/packing-reading':{},'@/lib/db':{withTransaction:()=>assert.fail('must not write')}});
 const request=sheet=>{const form=new FormData();form.set('file',new File(['fixture'],'packing.xlsx'));if(sheet)form.set('sheet',sheet);return new Request('http://localhost/api/receiving/interpret',{method:'POST',body:form})};
 const choice=await mod.POST(request());assert.equal(choice.status,409);assert.deepEqual((await choice.json()).sheets,['PER AIR','JAPS']);
 const chosen=await mod.POST(request('PER AIR'));assert.equal(chosen.status,200);assert.equal((await chosen.json()).boxes.length,1);
 assert.equal((await mod.POST(request('missing'))).status,400);
});
