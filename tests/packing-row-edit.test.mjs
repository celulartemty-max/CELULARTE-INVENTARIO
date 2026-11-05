import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function component(packing,newModel='',approved=true) {
    let state=0,changed;
    const source=readFileSync(new URL('../app/(app)/entradas/pedidos/[id]/packing-review.tsx',import.meta.url),'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{confirm:()=>approved})(name=>name==='react'?{useState:initial=>[state++===3?newModel:initial,()=>{}]}:name.includes('packing-column-order')?{orderedPackingColors:colors=>[...new Set(colors)]}:require(name),mod,mod.exports);
    const tree=mod.exports.default({packing,busy:false,onChange:p=>changed=p});
    function find(node,label){if(!node||typeof node!=='object')return; if(node.props?.['aria-label']===label||node.props?.children===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}}
    return {find:label=>find(tree,label),changed:()=>changed};
}
const packing={reference:'P',warnings:[],boxes:[{number:'5',items:[{model:'Honor',color:'black',expected:null},{model:'Honor',color:'clear',expected:50},{model:'SAM',color:'pink',expected:80}]},{number:'6',items:[{model:'Honor',color:'black',expected:50}]}]};
test('remove model row removes all its colours only from selected preview box',()=>{
    const before=JSON.stringify(packing),ui=component(packing);
    ui.find('Quitar fila Honor de caja 5').props.onClick();
    assert.deepEqual(Array.from(ui.changed().boxes[0].items,item=>item.model),['SAM']);
    assert.equal(ui.changed().boxes[1],packing.boxes[1]);assert.equal(JSON.stringify(packing),before);
});
test('add row creates blank quantities for existing colours and preserves other boxes',()=>{
    const ui=component(packing,'OPPO');ui.find('+ Agregar fila').props.onClick();
    const added=ui.changed().boxes[0].items.filter(item=>item.model==='OPPO');
    assert.deepEqual(Array.from(added,item=>item.color),['black','clear','pink']);
    assert.ok(added.every(item=>item.expected===null));assert.equal(ui.changed().boxes[1],packing.boxes[1]);
});
test('adding an existing model is blocked',()=>{const ui=component(packing,'SAM');assert.equal(ui.find('+ Agregar fila').props.disabled,true);ui.find('+ Agregar fila').props.onClick();assert.equal(ui.changed(),undefined);});
test('canceling removal leaves the preview untouched',()=>{const ui=component(packing,'',false);ui.find('Quitar fila Honor de caja 5').props.onClick();assert.equal(ui.changed(),undefined);});
test('removing the last row keeps an editable blank placeholder, never deletes the box',()=>{
    const ui=component({...packing,boxes:[packing.boxes[1]]});ui.find('Quitar fila Honor de caja 6').props.onClick();
    assert.equal(ui.changed().boxes.length,1);const item=ui.changed().boxes[0].items[0];assert.equal(item.model,'');assert.equal(item.expected,null);
});
