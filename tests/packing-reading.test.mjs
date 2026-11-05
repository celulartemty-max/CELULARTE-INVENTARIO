import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path){
    const mod={exports:{}};
    const code=ts.transpileModule(readFileSync(new URL('../lib/inventory/'+path+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInThisContext('(function(require,module,exports){'+code+'})')(name=>name.startsWith('./')?load(name.slice(2)):require(name),mod,mod.exports);
    return mod.exports;
}
const {parsePackingReading:parse,packingResponseFormat}=load('packing-reading');
const packing={reference:'P94K2',colors:['black'],warnings:[],boxes:[{number:'1',items:[{model:'13 / 13 Mini',color:'black',expected:250}]}]};
test('AI uses a strict recursive output schema, and the route still validates locally',()=>{
    assert.equal(packingResponseFormat.type,'json_schema');assert.equal(packingResponseFormat.json_schema.strict,true);
    function check(schema){if(schema.type==='object'){assert.equal(schema.additionalProperties,false);assert.deepEqual([...schema.required].sort(),Object.keys(schema.properties).sort());Object.values(schema.properties).forEach(check);}if(schema.items)check(schema.items);}
    check(packingResponseFormat.json_schema.schema);
    const route=readFileSync(new URL('../app/api/receiving/interpret/route.ts',import.meta.url),'utf8');
    assert.match(route,/response_format: packingResponseFormat/);assert.match(route,/parsePackingReading\(choice.message\?\.content\)/);
    assert.doesNotMatch(route,/INSERT INTO receiving_(items|cartons|orders)/);
});
test('safe transport conversions preserve numbers and missing optional metadata without changing input',()=>{
    const input={boxes:[{number:1,items:[{model:13,color:'black',expected:'250'}]}]};const before=JSON.stringify(input);
    const result=parse(input);assert.equal(result.boxes[0].number,'1');assert.equal(result.boxes[0].items[0].model,'13');assert.equal(result.boxes[0].items[0].expected,250);assert.equal(result.reference,'');assert.deepEqual(result.warnings,[]);assert.equal(JSON.stringify(input),before);
});
test('zero and null stay distinct, all colours and cartons retain original order',()=>{
    const input={...packing,colors:['black','silver','pink'],boxes:[{number:7,items:[{model:'A',color:'silver',expected:'0'},{model:'B',color:'pink',expected:null}]},{number:1,items:packing.boxes[0].items}]};
    const result=parse(input);assert.deepEqual(result.colors,input.colors);assert.deepEqual(result.boxes.map(b=>b.number),['7','1']);assert.equal(result.boxes[0].items[0].expected,0);assert.equal(result.boxes[0].items[1].expected,null);
});
test('never turn invalid or unknown quantity into zero, round it, or silently drop it',()=>{
    for(const expected of ['', ' ', 'unknown','1,000','1.5',1.5,-1,'-1',true,undefined,1000001]) assert.throws(()=>parse({...packing,boxes:[{number:'1',items:[{model:'A',color:'black',expected}]}]}),/Cantidad|Formato/);
});
test('duplicates, malformed JSON, empty or oversized readings remain rejected',()=>{
    assert.throws(()=>parse('{'),/incompleta/);
    assert.throws(()=>parse({...packing,boxes:[]}),/Formato/);
    assert.throws(()=>parse({...packing,boxes:[packing.boxes[0],{...packing.boxes[0],number:1}]}),/Modelo\/color repetido/);
    assert.throws(()=>parse({...packing,boxes:[{number:'1',items:[packing.boxes[0].items[0],packing.boxes[0].items[0]]}]}),/Modelo\/color repetido/);
    assert.throws(()=>parse({...packing,reference:'x'.repeat(161)}),/Formato/);
});
test('diamond packing rows 1, 2, 2 become two cartons, preserving all 1550 pieces',()=>{
    const colors=['gold','rainbow','black','silver','pink','orange'];
    const row=(number,model,values)=>({number,items:values.flatMap((expected,i)=>expected===null?[]:[{model,color:colors[i],expected}])});
    const input={...packing,colors,boxes:[row(1,'18 PRO/18 PRO MAX',[50,100,200,249,250,null]),row('2','18 DUO',[50,50,100,101,100,null]),row(' 2 ','17 PRO MAX',[null,null,null,null,null,300])]};
    const before=JSON.stringify(input),result=parse(input);
    assert.deepEqual(result.boxes.map(b=>b.number),['1','2']);
    assert.equal(result.boxes[1].items.length,6);
    assert.equal(result.boxes[1].items.at(-1).model,'17 PRO MAX');
    assert.equal(result.boxes.flatMap(b=>b.items).reduce((sum,item)=>sum+item.expected,0),1550);
    assert.equal(result.boxes[0].items[3].expected,249);assert.equal(result.boxes[1].items[3].expected,101);
    assert.deepEqual(result.colors,colors);assert.equal(JSON.stringify(input),before);
});
test('grouping keeps safety limits, malformed rows and duplicate combinations visible',()=>{
    const row=(model,expected=null)=>({number:'1',items:[{model,color:'black',expected}]});
    assert.throws(()=>parse({...packing,boxes:Array.from({length:1001},(_,i)=>row(String(i)))}),/Formato/);
    assert.throws(()=>parse({...packing,boxes:Array.from({length:501},(_,i)=>row(String(i)))}),/Formato/);
    assert.throws(()=>parse({...packing,boxes:[row('A'),{number:'1',items:[]}]}),/Formato/);
    assert.throws(()=>parse({...packing,boxes:[row('A'),row('a')]}),/Modelo\/color repetido/);
    const result=parse({...packing,boxes:[row('A',0),{...row('C'),number:'01'},row('B')]});
    assert.deepEqual(result.boxes.map(b=>b.number),['1','01']);
    assert.deepEqual(result.boxes[0].items.map(i=>i.expected),[0,null]);
});
test('transcription of the reported seven-carton document preserves all 6411 pieces',()=>{
    const quantities=[[250,150,200,150,50,50,70],[100,300,50,100,150,150,20,50],[40,150,20,150,60,50,100,160,60,30,100],[540,300,100],[560,270,60,50],[40,501,150,30,50,50,120],[300,180,50,300]];
    const result=parse({...packing,boxes:quantities.map((values,i)=>({number:i+1,items:values.map((expected,j)=>({model:String(j),color:'black',expected:String(expected)}))}))});
    assert.equal(result.boxes.length,7);assert.equal(result.boxes.flatMap(b=>b.items).reduce((sum,item)=>sum+item.expected,0),6411);
});
