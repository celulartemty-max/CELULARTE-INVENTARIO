import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},globals={}) {
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Set,JSON,...globals})(name=>name in mocks?mocks[name]:require(name),m,m.exports);return m.exports;
}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORDER=id(1),BRANCH=id(2),SESSION=id(3),OTHER=id(4),user={id:id(5),role:'MANAGER'};
const removal=load('lib/inventory/receiving-order-removal.ts',{'server-only':{}});
function fixture({counted=null,finished=false,arrived=false,registered=false,elsewhere=false,unrelated=false,voided=false,foreign=false}={}) {
    const order={id:ORDER,branch_id:BRANCH,product:'COMBO',reference:'PED-20',marking:foreign?'JAPS':'PER',shipping:'SEA',is_foreign:foreign,voided_at:voided?'today':null};
    const cartons=[{id:id(6),carton_number:'10',session_id:unrelated?OTHER:SESSION,counted_at:finished?'today':null},{id:id(7),carton_number:'2',session_id:elsewhere?OTHER:SESSION,counted_at:null},{id:id(8),carton_number:'3',session_id:null,counted_at:null}];
    const items=[{id:id(9),carton_id:id(6),model:'A06',color:'NEGRO',expected:20,counted}];
    const documents=[{id:id(10),filename:'original.xlsx'}],queries=[],audits=[];
    const c={query:async(sql,args=[])=>{
        queries.push({sql,args});let rows=[];
        if(sql.startsWith('SELECT o.*,COALESCE'))rows=args[0]===ORDER&&args[1]===BRANCH?[order]:[];
        else if(sql.startsWith('SELECT id,carton_number'))rows=cartons;
        else if(sql.startsWith('SELECT l.*'))rows=items;
        else if(sql.startsWith('SELECT id,filename'))rows=documents;
        else if(sql.startsWith('SELECT EXISTS'))rows=[{arrived,registered}];
        else if(sql.startsWith('INSERT INTO audit_events'))audits.push(JSON.parse(args[2]));
        else if(sql.startsWith('UPDATE receiving_orders')){order.voided_reference=order.reference;order.reference='ANULADO-'+ORDER;order.voided_at='today';}
        else if(sql.startsWith('UPDATE receiving_cartons'))cartons.filter(b=>b.session_id===args[1]).forEach(b=>{b.session_id=null});
        return {rows,rowCount:rows.length};
    }};
    return {c,queries,audits,order,cartons,items,documents};
}
const preview=f=>removal.removeReceivingOrder(f.c,user,SESSION,BRANCH,{action:'removeOrderPreview',orderId:ORDER});
const confirm=(f,p,extra={})=>removal.removeReceivingOrder(f.c,user,SESSION,BRANCH,{action:'removeOrder',orderId:ORDER,revision:p.revision,reason:'Producto equivocado',...extra});
test('preview identifies the exact product, mark and received boxes without any write',async()=>{
    const f=fixture(),p=await preview(f);assert.equal(p.product,'COMBO');assert.equal(p.marking,'PER');assert.equal(p.received,2);assert.equal(p.total,3);assert.equal(p.pending,1);assert.deepEqual(Array.from(p.boxes),['2','10']);
    assert.equal(f.queries.some(q=>/^(UPDATE|INSERT|DELETE)/.test(q.sql)),false);assert.ok(f.queries[0].sql.includes('o.branch_id=$2'));assert.ok(f.queries[0].sql.includes('FOR UPDATE OF o'));
});
test('confirmation soft-voids only the chosen order, preserves files/items, and frees its received cartons for recapture',async()=>{
    const f=fixture(),beforeItems=JSON.stringify(f.items),beforeDocs=JSON.stringify(f.documents);await confirm(f,await preview(f));
    assert.equal(f.order.voided_at,'today');assert.equal(f.order.voided_reference,'PED-20');assert.equal(f.order.reference,'ANULADO-'+ORDER);
    assert.equal(f.cartons.filter(b=>b.session_id===SESSION).length,0);assert.equal(JSON.stringify(f.items),beforeItems);assert.equal(JSON.stringify(f.documents),beforeDocs);
    const mutations=f.queries.filter(q=>/^(UPDATE|INSERT|DELETE)/.test(q.sql));assert.equal(mutations.length,3);assert.equal(f.audits.length,1);
    assert.equal(f.audits[0].sessionId,SESSION);assert.equal(f.audits[0].previous.reference,'PED-20');assert.equal(f.audits[0].reason,'Producto equivocado');assert.equal(f.audits[0].cartons[0].session_id,SESSION);
    assert.ok(mutations.every(q=>!q.sql.includes('receiving_sessions')&&!q.sql.includes('DELETE')));assert.equal(mutations[2].args[0],ORDER);assert.equal(mutations[2].args[1],SESSION);
    await assert.rejects(preview(f),/anulado/);
});
test('saved counts including zero, finished boxes, destination arrival, registration and other receipts all block removal',async()=>{
    for(const opts of [{counted:0},{counted:8},{finished:true},{arrived:true},{registered:true},{elsewhere:true}]) {
        const f=fixture(opts),p=await preview(f);assert.ok(p.blocked);await assert.rejects(confirm(f,p),/supervisada/);assert.equal(f.audits.length,0);assert.equal(f.order.voided_at,null);
    }
});
test('foreign orders may be corrected before destination arrival; unrelated and already voided orders may not',async()=>{
    const f=fixture({foreign:true});await confirm(f,await preview(f));assert.ok(f.order.voided_at);
    const unrelated=fixture({unrelated:true});unrelated.cartons.forEach(box=>{if(box.session_id===SESSION)box.session_id=OTHER});await assert.rejects(preview(unrelated));
    await assert.rejects(preview(fixture({voided:true})));
    await assert.rejects(removal.removeReceivingOrder(fixture().c,user,SESSION,OTHER,{action:'removeOrderPreview',orderId:ORDER}));
});
test('stale previews and blank or missing confirmation fields fail without writes',async()=>{
    const f=fixture(),p=await preview(f);f.documents.push({id:id(11),filename:'another.xlsx'});await assert.rejects(confirm(f,p),/pedido cambió/);assert.equal(f.audits.length,0);
    for(const extra of [{revision:undefined},{reason:''},{reason:'a'}]){const g=fixture();await assert.rejects(confirm(g,await preview(g),extra));assert.equal(g.audits.length,0);}
    const g=fixture(),q=await preview(g);g.items[0].counted=0;await assert.rejects(confirm(g,q),/conteos/);assert.equal(g.audits.length,0);
});
test('API enforces module, reviewer, branch and open receipt before delegating removal',async()=>{
    for(const opts of [{module:false},{operative:true},{branch:false},{closed:true},{}]) {
        let invoked=false;
        const f=load('lib/inventory/receiving.ts',{
            'server-only':{},'@/lib/db':{withTransaction:fn=>fn({query:async()=>({rows:[{branch_id:BRANCH,status:opts.closed?'CLOSED':'DRAFT'}]})})},
            '@/lib/auth/authorization':{hasModulePermission:async()=>opts.module!==false,assertBranchAccess:async()=>{if(opts.branch===false)throw Error('Sin sucursal')}},
            '@/lib/auth/special-permissions':{},'./receiving-validation':load('lib/inventory/receiving-validation.ts'),'./shipping-marks':{},'./packing-reset':{},'./packing-column-order':{},
            './receiving-order-removal':{removeReceivingOrder:async()=>{invoked=true;return {ok:true}}}
        });
        const request=f.receivingAction({...user,role:opts.operative?'OPERATIVE':'MANAGER'},{sessionId:SESSION,orderId:ORDER,action:'removeOrderPreview'});
        if(Object.keys(opts).length){await assert.rejects(request);assert.equal(invoked,false)}else{await request;assert.equal(invoked,true)}
    }
});
test('voided orders cannot reappear as pending arrivals, destination work or registration obligations',()=>{
    const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');
    for(const variable of ['pending','batches','orders'])assert.match(source.split('const '+variable+' =')[1].split(';')[0],/voided_at IS NULL/);
    const arrive=source.slice(source.indexOf("if (b.action === 'arrive')"),source.indexOf("if (b.action === 'count'"));assert.match(arrive,/ORDER BY o.id FOR UPDATE/);assert.match(arrive,/o.voided_at IS NULL/);
    const destination=readFileSync(new URL('../lib/inventory/receiving-destination.ts',import.meta.url),'utf8');assert.match(destination,/order.voided_at/);assert.match(destination,/WHERE o.voided_at IS NULL/);
    const registration=readFileSync(new URL('../lib/inventory/system-registration.ts',import.meta.url),'utf8');assert.match(registration,/WHERE o.voided_at IS NULL AND/);
});

function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
function words(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(words).join('');return typeof node==='object'?words(node.props?.children):String(node)}
function mount({blocked='',failure=false}={}) {
    let cursor=0,done=0;const state=[],calls=[];const jsx=(type,props)=>({type,props});
    const react={useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}};
    const Component=load('app/(app)/entradas/pedidos/[id]/order-removal.tsx',{
        react,'react/jsx-runtime':{jsx,jsxs:jsx},'./receiving-modal':{default:()=>null}
    },{FormData:class {constructor(f){this.f=f}get(k){return this.f[k]}},fetch:async(url,options)=>{
        const body=JSON.parse(options.body);calls.push(body);return {ok:!(failure&&body.action==='removeOrder'),json:async()=>body.action==='removeOrderPreview'?{revision:'fresh',product:'COMBO',shipping:'SEA',marking:'PER',received:2,total:3,pending:1,boxes:['1','2'],blocked}:{error:'El pedido cambió'}};
    }}).default;
    return {render:()=>{cursor=0;return Component({orderId:ORDER,sessionId:SESSION,busy:false,onDone:n=>{done+=n}})},calls,done:()=>done};
}
test('mobile preview explains unchanged physical total, future-carton impact and audit preservation; cancel is read-only',async()=>{
    const f=mount();await nodes(f.render()).find(n=>n.type==='button').props.onClick();const tree=f.render();assert.match(words(tree),/total físico recibido/);assert.match(words(tree),/faltantes previstos/);assert.match(words(tree),/historial/);
    const checkbox=nodes(tree).find(n=>n.type==='input');assert.equal(checkbox.props.required,true);
    nodes(tree).find(n=>n.type==='button'&&words(n)==='Cancelar').props.onClick();assert.equal(f.calls.length,1);assert.equal(f.done(),0);assert.equal(nodes(f.render()).some(n=>n.type==='form'),false);
});
test('mobile confirmation prevents duplicate requests, closes only on success and keeps errors visible',async()=>{
    const f=mount();await nodes(f.render()).find(n=>n.type==='button').props.onClick();const submit=nodes(f.render()).find(n=>n.type==='form').props.onSubmit;const e={preventDefault(){},currentTarget:{reason:'Producto equivocado'}};await Promise.all([submit(e),submit(e)]);
    assert.equal(f.calls.length,2);assert.equal(f.calls[1].revision,'fresh');assert.equal(f.calls[1].orderId,ORDER);assert.equal(f.calls[1].sessionId,SESSION);assert.equal(f.done(),2);
    const g=mount({failure:true});await nodes(g.render()).find(n=>n.type==='button').props.onClick();await nodes(g.render()).find(n=>n.type==='form').props.onSubmit(e);assert.equal(g.done(),0);assert.match(words(g.render()),/El pedido cambió/);assert.ok(nodes(g.render()).some(n=>n.type==='form'));
    const h=mount({blocked:'Ya tiene conteo'});await nodes(h.render()).find(n=>n.type==='button').props.onClick();assert.equal(nodes(h.render()).some(n=>n.type==='form'),false);
});
