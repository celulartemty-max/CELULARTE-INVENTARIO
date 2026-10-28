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
function fixture({kind='EXIT',side=null,quantity=35,evidenceFailure=false,confirmFailure=false,photoFailure=false,cameraFailure=false}={}){
    const state=[],requests=[],photos=[];let cursor=0,refreshes=0,opened=0,cameraNode;
    const row={id:'movement',kind,side,branch:'Plaza del Audio',branch_id:'plaza',reference:'SAL-1',created_at:'2026-10-28',correction:false};
    const react={useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]},useTransition:()=>[false,fn=>fn()]};
    const Queue=load('app/(app)/registros/registration-queue.tsx',{
        react,'next/navigation':{useRouter:()=>({refresh(){refreshes++}})},'./registration-detail':detail,
        '../entradas/pedidos/[id]/receiving-modal':{default:()=>null},'../entradas/pedidos/receiving.css':{},'./registration.css':{},
        '../pos-camera-guard':{preparePhoto:async file=>{photos.push(file);if(photoFailure)throw Error('Foto ilegible');return'data:image/jpeg;base64,compressed'}}
    },{fetch:async(url,options={})=>{
        const method=options.method??'GET',body=options.body?JSON.parse(options.body):null;requests.push({url,method,body});
        const failed=method==='POST'&&(url==='/api/pos-evidence'?evidenceFailure:confirmFailure);
        return {ok:!failed,json:async()=>method==='GET'?{row,lines:[{product:'AG GLASS',quantity}]}:failed?{error:'No se pudo guardar'}:{ok:true}};
    }}).default;
    const render=()=>{cursor=0;return Queue({rows:[row],compact:true,buttonLabel:'Confirmar'})};
    function camera(){const input=nodes(render()).find(n=>n.type==='input'&&n.props.type==='file');if(input){cameraNode={value:'old-file',click(){if(cameraFailure)throw Error('Bloqueada');opened++}};input.props.ref(cameraNode)}return input;}
    return{render,camera,cameraNode:()=>cameraNode,requests,photos,refreshes:()=>refreshes,opened:()=>opened,row};
}
async function open(f){await nodes(f.render()).find(n=>n.type==='button').props.onClick();}
const confirm=f=>nodes(f.render()).find(n=>n.props?.className==='receivingSave');
const photo={name:'sistema.jpg',type:'image/jpeg',size:100};
const selected=()=>({currentTarget:{files:[photo],value:'sistema.jpg'}});
test('one enabled confirm button opens rear camera synchronously and does not register before the photo',async()=>{
    const f=fixture();await open(f);const input=f.camera();assert.equal(input.props.capture,'environment');assert.equal(input.props.accept,'image/*');assert.equal(String(input.props['aria-hidden']),'true');
    assert.equal(nodes(f.render()).some(n=>n.props?.type==='checkbox'),false);assert.doesNotMatch(words(f.render()),/Agregar comprobante|Ya lo registré/);
    assert.equal(confirm(f).props.disabled,false);confirm(f).props.onClick();assert.equal(f.opened(),1);assert.equal(f.requests.length,1);assert.equal(f.photos.length,0);
});
test('cancelling capture makes no writes and another tap can reopen the camera',async()=>{
    const f=fixture();await open(f);let input=f.camera();confirm(f).props.onClick();let stopped=false;f.cameraNode().oncancel({stopPropagation(){stopped=true}});assert.equal(stopped,true);await input.props.onChange({currentTarget:{files:[],value:''}});
    assert.equal(f.requests.length,1);assert.equal(f.refreshes(),0);assert.ok(confirm(f));input=f.camera();confirm(f).props.onClick();assert.equal(f.opened(),2);
});
test('using the photo uploads evidence before confirmation, keeps scope and actor checks on server, then closes',async()=>{
    const f=fixture();await open(f);const input=f.camera();confirm(f).props.onClick();await input.props.onChange(selected());
    assert.equal(f.photos[0],photo);assert.equal(f.requests.length,3);assert.equal(f.requests[1].url,'/api/pos-evidence');assert.equal(f.requests[2].url,'/api/system-registration');
    assert.equal(f.requests[1].body.movementId,'movement');assert.equal(f.requests[1].body.pathname,'/salidas/movement');assert.equal(f.requests[2].body.kind,'EXIT');assert.equal(f.requests[2].body.side,null);
    assert.equal(f.refreshes(),1);assert.equal(confirm(f),undefined);assert.match(words(f.render()),/Registro confirmado/);
});
test('duplicate photo events submit once; busy state blocks closing or further confirmation',async()=>{
    const f=fixture();await open(f);const input=f.camera();const first=input.props.onChange(selected());assert.equal(confirm(f).props.disabled,true);
    await Promise.all([first,input.props.onChange(selected())]);assert.equal(f.requests.filter(r=>r.url==='/api/pos-evidence').length,1);assert.equal(f.requests.filter(r=>r.method==='POST'&&r.url==='/api/system-registration').length,1);
});
test('failed image preparation or evidence upload never confirms the movement and allows retaking the photo',async()=>{
    for(const options of [{photoFailure:true},{evidenceFailure:true}]){
        const f=fixture(options);await open(f);await f.camera().props.onChange(selected());
        assert.equal(f.requests.some(r=>r.method==='POST'&&r.url==='/api/system-registration'),false);assert.equal(f.refreshes(),0);assert.ok(confirm(f));assert.equal(confirm(f).props.disabled,false);assert.ok(nodes(f.render()).some(n=>n.props?.role==='alert'));
    }
});
test('server refusal preserves the panel without claiming registration succeeded',async()=>{
    const f=fixture({confirmFailure:true});await open(f);await f.camera().props.onChange(selected());assert.equal(f.refreshes(),0);assert.match(words(f.render()),/No se pudo guardar/);assert.doesNotMatch(words(f.render()),/Registro confirmado/);assert.ok(confirm(f));
});
test('camera opening failure is visible and incomplete quantities cannot launch or submit',async()=>{
    const f=fixture({cameraFailure:true});await open(f);f.camera();confirm(f).props.onClick();assert.match(words(f.render()),/No se pudo abrir la cámara/);assert.equal(f.requests.length,1);
    const g=fixture({quantity:null});await open(g);const input=g.camera();assert.equal(confirm(g).props.disabled,true);confirm(g).props.onClick();await input.props.onChange(selected());assert.equal(g.opened(),0);assert.equal(g.requests.length,1);
});
test('transfer sides and legacy returns retain their proper evidence context and endpoint',async()=>{
    for(const [kind,side,root] of [['TRANSFER','destination','traspasos'],['TRANSFER','origin','traspasos'],['RETURN_CUSTOMER',null,'devoluciones'],['RECEPTION',null,'entradas']]){
        const f=fixture({kind,side});await open(f);await f.camera().props.onChange(selected());assert.equal(f.requests[1].body.pathname,`/${root}/movement`);assert.equal(f.requests[2].body.side,side);
        assert.equal(f.requests[1].body.context,side==='destination'?'Registro de destino':'Registro de origen');
    }
});
test('new receiving flows retain their existing direct-confirm protocol without inventing inventory-movement evidence IDs',async()=>{
    for(const kind of ['RECEIVING','DESTINATION']){const f=fixture({kind});await open(f);assert.equal(f.camera(),undefined);await confirm(f).props.onClick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].url,'/api/system-registration');assert.equal(f.requests[1].body.kind,kind);}
});
