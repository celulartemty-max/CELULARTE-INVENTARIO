import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},extra={}){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m={exports:{}},jsx=(type,props)=>({type,props});vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,URLSearchParams,...extra})(n=>n in mocks?mocks[n]:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(n),m,m.exports);return m.exports;
}
const detail=load('app/(app)/registros/registration-detail.tsx');
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
function words(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(words).join('');return typeof node==='object'?words(node.props?.children):String(node)}
function fixture({kind='EXIT',side=null,quantity=35,confirmFailure=false,networkFailure=false}={}){
    const state=[],requests=[];let cursor=0,refreshes=0;
    const row={id:'movement',kind,side,branch:'Plaza del Audio',branch_id:'plaza',reference:'SAL-1',created_at:'2026-10-28',correction:false};
    const react={useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]},useTransition:()=>[false,fn=>fn()]};
    const Queue=load('app/(app)/registros/registration-queue.tsx',{
        react,'next/navigation':{useRouter:()=>({refresh(){refreshes++}})},'./registration-detail':detail,
        '../entradas/pedidos/[id]/receiving-modal':{default:()=>null},'../entradas/pedidos/receiving.css':{},'./registration.css':{}
    },{fetch:async(url,options={})=>{
        const method=options.method??'GET',body=options.body?JSON.parse(options.body):null;requests.push({url,method,body});
        if(method==='POST'&&networkFailure)throw Error('Sin conexión');const failed=method==='POST'&&confirmFailure;
        return {ok:!failed,json:async()=>method==='GET'?{row,lines:[{product:'AG GLASS',quantity}]}:failed?{error:'No se pudo guardar'}:{ok:true}};
    }}).default;
    const render=()=>{cursor=0;return Queue({rows:[row],compact:true,buttonLabel:'Confirmar'})};
    return{render,requests,refreshes:()=>refreshes,row};
}
async function open(f){await nodes(f.render()).find(n=>n.type==='button').props.onClick();}
const confirm=f=>nodes(f.render()).find(n=>n.props?.className==='receivingSave');

test('all registration kinds confirm directly without camera, photo upload or checkbox',async()=>{
 for(const [kind,side] of [['EXIT',null],['RECEPTION',null],['RETURN_ML',null],['RETURN_TIKTOK',null],['RETURN_CUSTOMER',null],['TRANSFER','origin'],['TRANSFER','destination'],['CLIENT_SALE','origin'],['RECEIVING',null],['DESTINATION',null]]){
  const f=fixture({kind,side});await open(f);
  assert.equal(nodes(f.render()).some(n=>n.props?.type==='file'||n.props?.capture||n.props?.type==='checkbox'),false);
  assert.doesNotMatch(words(f.render()),/cámara|fotograf|evidencia/);
  await confirm(f).props.onClick();
  assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,'/api/system-registration');
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].body)),{id:'movement',kind,side});
  assert.equal(f.refreshes(),1);assert.equal(confirm(f),undefined);assert.match(words(f.render()),/Registro confirmado/);
 }
});
test('opening and closing detail do not register anything',async()=>{
 const f=fixture();await open(f);assert.equal(f.requests.length,1);
 nodes(f.render()).find(n=>n.props?.title==='PLAZA DEL AUDIO').props.onClose();
 assert.equal(confirm(f),undefined);assert.equal(f.requests.length,1);
});
test('double click confirms once and disables the button while pending',async()=>{
 const f=fixture();await open(f);const button=confirm(f),first=button.props.onClick();
 assert.equal(confirm(f).props.disabled,true);await Promise.all([first,button.props.onClick()]);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
});
test('server or network failure keeps detail open without claiming success',async()=>{
 for(const options of [{confirmFailure:true},{networkFailure:true}]){
  const f=fixture(options);await open(f);await confirm(f).props.onClick();
  assert.equal(f.refreshes(),0);assert.ok(confirm(f));assert.equal(confirm(f).props.disabled,false);
  assert.ok(nodes(f.render()).some(n=>n.props?.role==='alert'));assert.doesNotMatch(words(f.render()),/Registro confirmado/);
 }
});
test('incomplete quantities cannot confirm even through a programmatic click',async()=>{
 const f=fixture({quantity:null});await open(f);assert.equal(confirm(f).props.disabled,true);
 await confirm(f).props.onClick();assert.equal(f.requests.length,1);
});
test('global movement screens no longer mount the camera interceptor; old evidence is not deleted',()=>{
 const layout=readFileSync(new URL('../app/(app)/layout.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(layout,/PosCameraGuard|pos-camera-guard/);
 const server=readFileSync(new URL('../lib/inventory/system-registration.ts',import.meta.url),'utf8');
 assert.doesNotMatch(server,/POS_EVIDENCE_CAPTURED|DELETE FROM audit_events/);
});
