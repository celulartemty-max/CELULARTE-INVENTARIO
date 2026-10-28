import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    const jsx=(type,props)=>({type,props});
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(name=>name in mocks?mocks[name]:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(name),mod,mod.exports);
    return mod.exports;
}
function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
test('product creation and catalogue listing do not require, create or fetch colours',async()=>{
    const queries=[];
    const f=load('lib/inventory/products.ts',{'server-only':{},'@/lib/auth/authorization':{hasModulePermission:async()=>true},'@/lib/db':{sql:async(parts,...values)=>{queries.push({sql:parts.join('?'),values});return []}}});
    await f.createProduct({role:'MASTER'},'COMBO CASE');await f.listProducts();
    assert.equal(queries.length,2);assert.doesNotMatch(JSON.stringify(queries),/product_colors/);assert.match(queries[0].sql,/INSERT INTO products\(name\)/);
});
test('product editor has no colour setup or colour mutations',()=>{
    const source=readFileSync(new URL('../app/(app)/productos/product-admin.tsx',import.meta.url),'utf8');
    assert.doesNotMatch(source,/createColor|renameColor|colorStatus|type="color"|p\.colors/);
    assert.match(source,/createProduct/);assert.match(source,/renameProduct/);
});
test('colour picker offers only unique order colours and explicit local colour addition',()=>{
    let choice='';
    const f=load('app/(app)/entradas/pedidos/packing-color-field.tsx',{react:{useState:()=>[choice,v=>{choice=v}]}}).default;
    let tree=nodes(f({colors:['NEGRO','AZUL','NEGRO','']}));
    assert.deepEqual(tree.filter(n=>n.type==='option').map(n=>n.props.value),['','NEGRO','AZUL','__new__']);
    tree.find(n=>n.type==='select').props.onChange({target:{value:'__new__'}});
    tree=nodes(f({colors:['NEGRO'],disabled:true}));
    const input=tree.find(n=>n.type==='input');assert.equal(input.props.name,'color');assert.equal(input.props.required,true);assert.equal(input.props.disabled,true);
    assert.equal(tree.find(n=>n.type==='select').props.name,undefined);
});
test('source and destination count forms both use order-local colour selection',()=>{
    for(const path of ['[id]/receiving-editor.tsx','destino/[orderId]/destination-editor.tsx']){
        const source=readFileSync(new URL('../app/(app)/entradas/pedidos/'+path,import.meta.url),'utf8');
        assert.match(source,/<PackingColorField/);assert.doesNotMatch(source,/product\.colors/);
    }
});
