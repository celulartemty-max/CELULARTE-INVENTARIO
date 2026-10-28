import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},globals={}){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m={exports:{}};const jsx=(type,props)=>({type,props});vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,...globals})(n=>n in mocks?mocks[n]:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(n),m,m.exports);return m.exports;
}
function fixture(permission=true){
    const queries=[],checks=[];const f=load('lib/inventory/products.ts',{
        'server-only':{},'@/lib/auth/authorization':{hasModulePermission:async(u,module)=>{checks.push({u,module});return u.role==='MASTER'||permission}},
        '@/lib/db':{sql:async(parts,...args)=>{queries.push({sql:parts.join('?'),args});return[{id:'product'}]}}
    });return{...f,queries,checks};
}
test('authorized operative and manager users can create products; permission is checked before each write',async()=>{
    for(const role of ['OPERATIVE','MANAGER','MASTER']){
        const f=fixture();const u={id:'user',role};const rows=await f.createProduct(u,'  COMBO CASE  ');
        assert.equal(rows[0].id,'product');assert.equal(f.queries.length,1);assert.match(f.queries[0].sql,/INSERT INTO products\(name\)/);assert.equal(f.queries[0].args[0],'COMBO CASE');assert.equal(f.checks[0].module,'PRODUCTOS');assert.equal(f.checks[0].u.id,'user');
    }
});
test('users without Products cannot create even if they can use another module; blank names remain rejected',async()=>{
    for(const role of ['OPERATIVE','MANAGER']){
        const f=fixture(false);await assert.rejects(f.createProduct({role},'COMBO'),/PRODUCTOS_PERMISSION_REQUIRED/);assert.equal(f.queries.length,0);
    }
    const f=fixture();await assert.rejects(f.createProduct({role:'OPERATIVE'},'   '),/NAME_REQUIRED/);assert.equal(f.queries.length,0);
});
test('catalogue creation does not grant renaming, deactivation, or legacy colour management',async()=>{
    const f=fixture();const u={role:'OPERATIVE'};
    for(const action of [()=>f.renameProduct(u,'product','Nuevo'),()=>f.setProductStatus(u,'product','INACTIVE'),()=>f.createColor(u,'product','AZUL'),()=>f.renameColor(u,'color','AZUL'),()=>f.setColorStatus(u,'color','INACTIVE')])await assert.rejects(action(),/MASTER_REQUIRED/);
    assert.equal(f.queries.length,0);
    await f.renameProduct({role:'MASTER'},'product','Nuevo');assert.match(f.queries[0].sql,/UPDATE products SET name/);
});
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
function words(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(words).join('');return typeof node==='object'?words(node.props?.children):String(node)}
test('page respects module permission instead of master role and exposes edit controls only to master',async()=>{
    for(const [role,permission] of [['OPERATIVE',true],['MANAGER',true],['MASTER',true],['OPERATIVE',false],['MANAGER',false]]){
        let listed=false;const Admin=()=>null;
        const p=load('app/(app)/productos/page.tsx',{
            '@/lib/auth/authorization':{requireUser:async()=>({id:'user',role}),hasModulePermission:async()=>permission},
            '@/lib/inventory/products':{listProducts:async()=>{listed=true;return[{id:'p',name:'COMBO',status:'ACTIVE'}]}},'./product-admin':{default:Admin}
        });
        const tree=await p.default();const admin=nodes(tree).find(n=>n.type===Admin);assert.equal(listed,permission);
        if(permission){assert.ok(admin);assert.equal(admin.props.canEdit,role==='MASTER')}else{assert.equal(admin,undefined);assert.match(words(tree),/No tienes permiso/)}
    }
});
function mount(canEdit=false){
    const state=[];let cursor=0;const Component=load('app/(app)/productos/product-admin.tsx',{
        react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]}}
    }).default;
    return()=>{cursor=0;return Component({initial:[{id:'p',name:'COMBO',status:'ACTIVE'}],canEdit})};
}
test('collaborator UI shows catalogue and create form without edit actions; master retains editing',()=>{
    const render=mount();const tree=render();assert.match(words(tree),/Agregar producto/);assert.match(words(tree),/COMBO/);assert.doesNotMatch(words(tree),/Editar producto/);assert.equal(nodes(tree).filter(n=>n.type==='form').length,1);
    const master=mount(true);nodes(master()).find(n=>n.type==='button'&&words(n)==='Editar producto').props.onClick();assert.ok(nodes(master()).some(n=>n.props?.className==='renameForm'));
});
test('product API still authenticates each request and wraps mutations in the audit route',()=>{
    const source=readFileSync(new URL('../app/api/products/route.ts',import.meta.url),'utf8');assert.match(source,/await requireUser\(\)/);assert.match(source,/await createProduct\(u,/);assert.match(source,/POST = auditRoute\(handlePOST\)/);
});
