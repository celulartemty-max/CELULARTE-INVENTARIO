import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},globals={}) {
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Set,JSON,...globals})(n=>n in mocks?mocks[n]:require(n),m,m.exports);
    return m.exports;
}
const {resetPacking}=load('lib/inventory/packing-reset.ts',{'server-only':{}});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORDER=id(1),BRANCH=id(2),SESSION=id(3),BOX=id(4),ITEM=id(5),DOC=id(6),user={id:id(7),role:'MANAGER'};
function fixture({quantity=null,finished=false,registered=false,closed=false,empty=false}={}) {
    const queries=[],audits=[];
    const boxes=[{id:BOX,carton_number:'10',counted_at:finished?'now':null,session_id:SESSION,session_status:closed?'CLOSED':'DRAFT'}, {id:id(8),carton_number:'2',counted_at:null,session_id:null,session_status:null}];
    const items=empty?[]:[{id:ITEM,carton_id:BOX,model:'A06',color:'NEGRO',expected:50,counted:quantity}];
    const documents=empty?[]:[{id:DOC,filename:'packing-equivocado.xlsx'}];
    const c={query:async(sql,args=[])=>{
        queries.push({sql,args});let rows=[];
        if(sql.startsWith('SELECT b.id,b.carton_number'))rows=boxes;
        else if(sql.startsWith('SELECT l.id,l.carton_id'))rows=items;
        else if(sql.startsWith('SELECT d.id,d.filename'))rows=documents;
        else if(sql.startsWith('SELECT 1 FROM receiving_destination_registrations'))rows=registered?[{ok:1}]:[];
        else if(sql.startsWith('INSERT INTO audit_events'))audits.push(JSON.parse(args[2]));
        return {rows,rowCount:rows.length};
    }};
    return {c,queries,audits,items,documents};
}
const preview=f=>resetPacking(f.c,user,ORDER,BRANCH,{action:'packingResetPreview'});
const confirm=(f,p,extra={})=>resetPacking(f.c,user,ORDER,BRANCH,{action:'resetPacking',revision:p.revision,reason:'Packing equivocado',...extra});
test('preview is read-only, includes whole-order impact, numeric box order and active files',async()=>{
    const f=fixture(),p=await preview(f);
    assert.deepEqual(Array.from(p.boxes),['2','10']);assert.equal(p.lines,1);assert.equal(p.documents[0],'packing-equivocado.xlsx');assert.equal(p.blocked,'');
    assert.equal(f.queries.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q.sql)),false);
    assert.ok(f.queries.some(q=>q.sql.includes('FOR UPDATE OF b')));assert.ok(f.queries.some(q=>q.sql.includes('FOR UPDATE OF l')));
});
test('reset snapshots old lines and archive IDs, deletes only selected order contents, never cartons or originals',async()=>{
    const f=fixture();await confirm(f,await preview(f));
    assert.equal(f.audits.length,1);assert.equal(f.audits[0].orderId,ORDER);assert.equal(f.audits[0].reason,'Packing equivocado');
    assert.equal(f.audits[0].previous[0].expected,50);assert.equal(f.audits[0].previous[0].counted,null);assert.equal(f.audits[0].documentIds[0],DOC);
    const mutations=f.queries.filter(q=>/^(INSERT|UPDATE|DELETE)/.test(q.sql));assert.equal(mutations.length,3);
    assert.match(mutations[1].sql,/DELETE FROM receiving_items.*WHERE order_id=\$1/);assert.equal(mutations[1].args[0],ORDER);
    assert.doesNotMatch(mutations.map(q=>q.sql).join(' '),/DELETE FROM receiving_(cartons|documents|sessions|orders)/);
});
test('saved zero, partial counts, finished boxes and prior registration all prevent any mutation, even MASTER',async()=>{
    for(const opts of [{quantity:0},{quantity:12},{finished:true},{registered:true},{closed:true}]) {
        const f=fixture(opts),p=await preview(f);assert.ok(p.blocked);
        await assert.rejects(resetPacking(f.c,{...user,role:'MASTER'},ORDER,BRANCH,{action:'resetPacking',revision:p.revision,reason:'Packing equivocado'}),/supervisada/);
        assert.equal(f.queries.some(q=>/^(INSERT|UPDATE|DELETE)/.test(q.sql)),false);
    }
});
test('stale preview and changed content are rejected, preserving newly entered work',async()=>{
    const f=fixture(),p=await preview(f);f.items[0].model='A16';
    await assert.rejects(confirm(f,p),/pedido cambió/);assert.equal(f.audits.length,0);
    const g=fixture(),q=await preview(g);g.items[0].counted=0;
    await assert.rejects(confirm(g,q),/contadas/);assert.equal(g.audits.length,0);
});
test('empty reason, missing revision and empty order cannot reset',async()=>{
    const f=fixture(),p=await preview(f);
    for(const extra of [{reason:''},{reason:'a'},{revision:undefined}])await assert.rejects(confirm(f,p,extra));
    const g=fixture({empty:true});await assert.rejects(confirm(g,await preview(g)),/No hay contenido/);
    assert.equal(f.audits.length,0);assert.equal(g.audits.length,0);
});
test('destination may correct uncounted contents after origin archive, but never destination registration',async()=>{
    const f=fixture({closed:true});const p=await resetPacking(f.c,user,ORDER,BRANCH,{action:'packingResetPreview',destination:true});assert.equal(p.blocked,'');
    await confirm(f,p,{destination:true});assert.equal(f.audits[0].destination,true);
    const g=fixture({registered:true});const q=await resetPacking(g.c,user,ORDER,BRANCH,{action:'packingResetPreview',destination:true});assert.ok(q.blocked);
});
test('both reset entry points enforce reviewer, branch ownership and physical arrival; body cannot bypass source gate',()=>{
    const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');
    const section=source.slice(source.indexOf("if (b.action === 'packingResetPreview'"),source.indexOf("if (b.action === 'packing')"));
    assert.match(section,/receivingAccess\(u,true\)/);assert.match(section,/order.branch_id !== s.branch_id/);assert.match(section,/session_id=\$2/);assert.match(section,/destination:false/);
    const dest=readFileSync(new URL('../lib/inventory/receiving-destination.ts',import.meta.url),'utf8');
    const d=dest.slice(dest.indexOf("if (body.action === 'packingResetPreview'"),dest.indexOf("if (body.action === 'confirmArrival')"));
    assert.match(d,/receivingAccess\(u,true\)/);assert.match(d,/receiving_destination_arrivals/);assert.match(d,/destination:true/);
});
test('historical files stay downloadable and do not consume the active-file upload allowance',()=>{
    for(const path of ['app/api/receiving/documents/route.ts','lib/inventory/receiving.ts','lib/inventory/receiving-destination.ts']) {
        const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.match(source,/RECEIVING_PACKING_RESET/);assert.match(source,/documentIds/);
    }
    const ui=readFileSync(new URL('../app/(app)/entradas/pedidos/[id]/packing-reset.tsx',import.meta.url),'utf8');
    assert.match(ui,/type="checkbox" required/);assert.match(ui,/minLength=\{5\}/);assert.match(ui,/lock.current/);assert.match(ui,/sin guardar/);
});

test('source endpoint rejects operative, wrong branch, foreign order, unrelated receipt and closed sessions',async()=>{
    for(const options of [{operative:true},{branchDenied:true},{foreign:true},{unrelated:true},{closed:true},{}]) {
        let resetArgs;
        const order={branch_id:BRANCH,is_foreign:!!options.foreign};
        const session={id:SESSION,branch_id:BRANCH,status:options.closed?'CLOSED':'DRAFT'};
        const c={query:async sql=>{
            const rows=sql.startsWith('SELECT * FROM receiving_sessions')?[session]:sql.startsWith('SELECT branch_id,is_foreign FROM receiving_orders')?[order]:sql.startsWith('SELECT 1 FROM receiving_cartons')&&!options.unrelated?[{ok:1}]:[];
            return {rows,rowCount:rows.length};
        }};
        const f=load('lib/inventory/receiving.ts',{
            'server-only':{},'@/lib/db':{withTransaction:fn=>fn(c)},'@/lib/auth/special-permissions':{},
            '@/lib/auth/authorization':{hasModulePermission:async()=>true,assertBranchAccess:async()=>{if(options.branchDenied)throw Error('Sin sucursal')}},
            './receiving-validation':load('lib/inventory/receiving-validation.ts'), './shipping-marks':{},
            './packing-reset':{resetPacking:async(...args)=>{resetArgs=args;return {ok:true}}},
            './packing-column-order':load('lib/inventory/packing-column-order.ts'),
            './receiving-order-removal':{}
        });
        const promise=f.receivingAction({...user,role:options.operative?'OPERATIVE':'MANAGER'},{action:'resetPacking',sessionId:SESSION,orderId:ORDER,destination:true});
        if(Object.keys(options).length){await assert.rejects(promise);assert.equal(resetArgs,undefined);}
        else {await promise;assert.equal(resetArgs[4].destination,false);assert.equal(resetArgs[2],ORDER);}
    }
});

function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
function words(node){if(node==null||typeof node==='boolean')return '';if(Array.isArray(node))return node.map(words).join('');return typeof node==='object'?words(node.props?.children):String(node)}
function uiFixture({blocked='',failReset=false,destination=false}={}) {
    let cursor=0,done=0;const state=[],calls=[];
    const jsx=(type,props)=>({type,props});
    const react={useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}};
    const Component=load('app/(app)/entradas/pedidos/[id]/packing-reset.tsx',{
        react,'react/jsx-runtime':{jsx,jsxs:jsx},'./receiving-modal':{default:()=>null}
    },{FormData:class {constructor(form){this.form=form}get(k){return this.form[k]}},fetch:async(url,options)=>{
        const payload=JSON.parse(options.body);calls.push({url,payload});
        return {ok:!(failReset&&payload.action==='resetPacking'),json:async()=>payload.action==='packingResetPreview'?{revision:'revision',boxes:['1'],lines:2,documents:['old.xlsx'],blocked}:{error:'Pedido cambió'} };
    }}).default;
    return {render:()=>{cursor=0;return Component({orderId:ORDER,sessionId:SESSION,destination,onDone:()=>done++})},calls,done:()=>done};
}
test('mobile reset opens a read-only preview, shows exact impact and can cancel without changing data',async()=>{
    const f=uiFixture();await nodes(f.render()).find(n=>n.type==='button').props.onClick();
    const tree=f.render();assert.match(words(tree),/2 renglones/);assert.match(words(tree),/old.xlsx/);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].payload.action,'packingResetPreview');
    nodes(tree).find(n=>n.type==='button'&&words(n)==='Cancelar').props.onClick();assert.equal(nodes(f.render()).some(n=>n.type==='form'),false);assert.equal(f.done(),0);
});
test('blocked reset never exposes a submit button',async()=>{
    const f=uiFixture({blocked:'Ya tiene conteo'});await nodes(f.render()).find(n=>n.type==='button').props.onClick();
    assert.match(words(f.render()),/Ya tiene conteo/);assert.equal(nodes(f.render()).some(n=>n.type==='form'),false);
});
test('confirmed reset sends revision and reason to correct endpoint, prevents double submit and closes only on success',async()=>{
    for(const destination of [false,true]) {
        const f=uiFixture({destination});await nodes(f.render()).find(n=>n.type==='button').props.onClick();
        const submit=nodes(f.render()).find(n=>n.type==='form').props.onSubmit;
        const event={preventDefault(){},currentTarget:{reason:'Packing equivocado'}};
        await Promise.all([submit(event),submit(event)]);
        assert.equal(f.calls.length,2);assert.equal(f.calls[1].url,destination?'/api/receiving/destination':'/api/receiving');assert.equal(f.calls[1].payload.revision,'revision');assert.equal(f.calls[1].payload.reason,'Packing equivocado');assert.equal(f.done(),1);
        assert.equal(nodes(f.render()).some(n=>n.type==='form'),false);
    }
    const g=uiFixture({failReset:true});await nodes(g.render()).find(n=>n.type==='button').props.onClick();
    await nodes(g.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{reason:'Error de archivo'}});
    assert.equal(g.done(),0);assert.match(words(g.render()),/Pedido cambió/);assert.ok(nodes(g.render()).some(n=>n.type==='form'));
});
