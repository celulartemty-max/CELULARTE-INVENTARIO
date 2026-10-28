import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../app/(app)/traspasos/[id]/transfer-receipt.tsx',import.meta.url),'utf8');
function fixture({canReceive=true,onReceive,kind='TRANSFER'}={}){
    const state=[],calls=[],lock={current:false};let cursor=0;
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    const mocks={react:{useRef:()=>lock,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=v}]}},'./transfer-receipt.css':{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{Intl,Error})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    const props={transfer:{destination:'Treviño',origin:'Plaza del Audio',folio:'TRA-FIXTURE',transferKind:kind},lines:[{id:'line',product:'MICA PREMIUM CELULARTE',sentQuantity:70,receivedQuantity:null,differenceReason:null,saleAmount:350}],canReceive,onReceive:async rows=>{calls.push(rows);if(onReceive)return onReceive(rows)}};
    return {calls,render:()=>{cursor=0;return mod.exports.default(props)}};
}
function walk(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(walk)]}
const input=f=>walk(f.render()).find(n=>n.type==='input'&&n.props.type==='number');
const submit=f=>walk(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
test('receipt has one compact product list, branch heading and collapsed folio instead of duplicated summaries',()=>{
    const f=fixture(),html=renderToStaticMarkup(f.render());
    assert.match(html,/Recibir en TREVIÑO/);assert.match(html,/Desde Plaza del Audio/);assert.match(html,/Enviado/);assert.match(html,/Recibido/);
    assert.equal((html.match(/<li>/g)||[]).length,1);assert.match(html,/<details[^>]*><summary>Ver detalles<\/summary><p>Folio: TRA-FIXTURE/);
    assert.doesNotMatch(html,/RESUMEN DEL ENVÍO|Piezas enviadas|registrationQueue/);assert.equal(input(f).props.value,'70');
});
test('unchanged counts submit physical receipt only and do not request a difference reason',async()=>{
    const f=fixture();assert.doesNotMatch(renderToStaticMarkup(f.render()),/Motivo de la diferencia/);
    await submit(f);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0].received,70);
});
test('a changed quantity reveals the required reason and blocks submission until completed, including zero',async()=>{
    const f=fixture();input(f).props.onChange({target:{value:'0'}});
    let tree=f.render();assert.match(renderToStaticMarkup(tree),/Motivo de la diferencia/);assert.equal(walk(tree).find(n=>n.type==='button').props.disabled,true);
    await submit(f);assert.equal(f.calls.length,0);
    walk(tree).find(n=>n.type==='input'&&n.props.type!=='number').props.onChange({target:{value:'No llegó ninguna pieza'}});
    await submit(f);assert.equal(f.calls[0][0].received,0);assert.equal(f.calls[0][0].reason,'No llegó ninguna pieza');
    input(f).props.onChange({target:{value:'70'}});assert.doesNotMatch(renderToStaticMarkup(f.render()),/Motivo de la diferencia/);
});
test('blank, negative and fractional counts never submit',async()=>{
    for(const value of ['','-1','1.5']){const f=fixture();input(f).props.onChange({target:{value}});await submit(f);assert.equal(f.calls.length,0)}
});
test('origin-only access remains read-only while sales retain their amounts',async()=>{
    const f=fixture({canReceive:false,kind:'SALE'}),html=renderToStaticMarkup(f.render());
    assert.equal(input(f),undefined);assert.doesNotMatch(html,/Confirmar recepción/);assert.match(html,/sucursal destino/);assert.match(html,/Total de venta/);assert.match(html,/350/);
    await submit(f);assert.equal(f.calls.length,0);
});
test('in-flight receipt locks inputs and duplicate submission; a failed request preserves the count',async()=>{
    let release;const f=fixture({onReceive:()=>new Promise(resolve=>{release=resolve})});
    const first=submit(f);await submit(f);assert.equal(f.calls.length,1);assert.equal(input(f).props.disabled,true);release();await first;
    assert.equal(input(f).props.disabled,false);
    const failed=fixture({onReceive:async()=>{throw Error('Sin conexión')}});await submit(failed);
    assert.match(renderToStaticMarkup(failed.render()),/Sin conexión/);assert.equal(input(failed).props.value,'70');
});
