import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const USER=id(1),BRANCH=id(2),OTHER=id(3),RECEIPT=id(4);
function load(path,mocks={}) {
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Date,Set})(n=>n in mocks?mocks[n]:require(n),mod,mod.exports);return mod.exports;
}
const body={action:'create',branchId:BRANCH,reference:'Prueba de autorización',date:'2026-10-28',total:10,cost:null,currency:'MXN',notes:'',carrier:'Castores',tracking:''};
function fixture({permission=true,branches=[BRANCH],validBranch=true}={}) {
    const queries=[];
    const f=load('lib/inventory/receiving.ts',{
        'server-only':{},'@/lib/auth/special-permissions':{},
        '@/lib/auth/authorization':{hasModulePermission:async(u,module)=>{assert.equal(module,'ENTRADAS');return u.role==='MASTER'||permission},assertBranchAccess:async(u,branch)=>{if(u.role!=='MASTER'&&!branches.includes(branch))throw Error('FORBIDDEN_BRANCH')}},
        '@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{queries.push({sql,args});const rows=sql.startsWith('SELECT 1 FROM branches')?(validBranch?[{ok:1}]:[]):sql.startsWith('INSERT INTO receiving_sessions')?[{id:RECEIPT}]:[];return{rows,rowCount:rows.length}}})},
        './receiving-validation':load('lib/inventory/receiving-validation.ts'),'./shipping-marks':{},'./packing-reset':{},'./packing-column-order':{},'./receiving-order-removal':{}
    });return{...f,queries};
}
test('OPERATIVE, MANAGER and MASTER can create with Entradas access; creator and branch remain audited',async()=>{
    for(const role of ['OPERATIVE','MANAGER','MASTER']) {
        const f=fixture();const result=await f.receivingAction({id:USER,role},body);assert.equal(result.id,RECEIPT);
        const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO receiving_sessions'));assert.equal(insert.args[0],BRANCH);assert.equal(insert.args[7],USER);assert.equal(insert.args[3],10);
        const audit=f.queries.find(q=>q.sql.startsWith('INSERT INTO audit_events'));assert.equal(audit.args[0],USER);assert.equal(audit.args[1],BRANCH);assert.equal(audit.args[2],'RECEIVING_CREATED');
    }
});
test('no module access, no branch assignment, or a different branch denies creation without writes',async()=>{
    for(const options of [{permission:false},{branches:[]},{branches:[OTHER]}]) {
        const f=fixture(options);await assert.rejects(f.receivingAction({id:USER,role:'OPERATIVE'},body));assert.equal(f.queries.length,0);
    }
});
test('an authorized extra branch works but inactive or uncontrolled branches are rejected',async()=>{
    const f=fixture({branches:[BRANCH,OTHER]});await f.receivingAction({id:USER,role:'OPERATIVE'},{...body,branchId:OTHER});assert.equal(f.queries.find(q=>q.sql.startsWith('INSERT INTO receiving_sessions')).args[0],OTHER);
    const g=fixture({validBranch:false});await assert.rejects(g.receivingAction({id:USER,role:'OPERATIVE'},body),/Sucursal no válida/);assert.equal(g.queries.some(q=>q.sql.startsWith('INSERT')),false);
    assert.match(g.queries[0].sql,/status='ACTIVE'.*Treviño.*Plaza del Audio/);
});
test('invalid intake quantities still fail before data mutation',async()=>{
    for(const total of [0,-1,1.5,1001]){const f=fixture();await assert.rejects(f.receivingAction({id:USER,role:'OPERATIVE'},{...body,total}));assert.equal(f.queries.length,0);}
});
test('creation does not grant reviewer or system-registration permission',async()=>{
    const f=fixture();await assert.rejects(f.receivingAccess({id:USER,role:'OPERATIVE'},true),/Sin permiso/);
    const source=readFileSync(new URL('../lib/inventory/receiving.ts',import.meta.url),'utf8');
    for(const action of ['packing','editOrder','close']){
        const start=source.indexOf(`if (b.action === '${action}')`);assert.ok(start>=0);assert.match(source.slice(start,start+140),/receivingAccess\(u,\s*true\)/);
    }
    assert.match(source,/if \(b.action === 'pos'\) await requireSystemRegistration\(u\)/);
});

function nodes(node){if(!node||typeof node!=='object')return [];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
test('receiving page exposes creation for operative users and scopes the branch selector',async()=>{
    for(const allowed of [[BRANCH],[BRANCH,OTHER],[]]) {
        const jsx=(type,props)=>({type,props});const New=()=>null;
        const p=load('app/(app)/entradas/pedidos/page.tsx',{
            'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:()=>null},'./receiving.css':{},
            '@/lib/auth/authorization':{requireUser:async()=>({id:USER,role:'OPERATIVE'}),getAuthorizedBranchIds:async()=>allowed},
            '@/lib/db':{sql:async()=>[{id:BRANCH,name:'Treviño'},{id:OTHER,name:'Plaza del Audio'}]},
            '@/lib/inventory/receiving':{receivingAccess:async()=>{}},'./receiving-new':{default:New},
            '@/lib/inventory/receiving-overview':{receivingOverview:async()=>[]},'./receiving-receipt-card':{default:()=>null}
        });
        const tree=await p.default({});const form=nodes(tree).find(n=>n.type===New);
        if(allowed.length){assert.ok(form);assert.deepEqual(Array.from(form.props.branches.map(b=>b.id)),allowed)}
        else{assert.equal(form,undefined);assert.ok(nodes(tree).some(n=>n.props?.role==='status'))}
    }
});
