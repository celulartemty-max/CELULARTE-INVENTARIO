import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={},extra={}){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const m={exports:{}},jsx=(type,props)=>({type,props});vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,...extra})(n=>n in mocks?mocks[n]:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:require(n),m,m.exports);return m.exports;
}
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
function words(node){if(node==null||typeof node==='boolean')return'';if(Array.isArray(node))return node.map(words).join('');return typeof node==='object'?words(node.props?.children):String(node)}
const initial=[{id:'active',name:'COMBO',status:'ACTIVE'},{id:'inactive',name:'ANILLO',status:'INACTIVE'}];
function mount({canEdit=true,approve=true,ok=true,products=initial}={}){
    const state=[],requests=[],prompts=[];let cursor=0,reloads=0;
    const Component=load('app/(app)/productos/product-admin.tsx',{
        react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]}}
    },{confirm:message=>{prompts.push(message);return approve},location:{reload(){reloads++}},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return{ok}}}).default;
    return{render:()=>{cursor=0;return Component({initial:products,canEdit})},requests,prompts,reloads:()=>reloads};
}
test('master sees delete on active products and a separate reversible history section',()=>{
    const f=mount(),tree=f.render();assert.equal(nodes(tree).filter(n=>n.type==='button'&&words(n)==='Eliminar').length,1);
    assert.match(words(tree),/Productos eliminados del catálogo \(1\)/);assert.match(words(tree),/Restaurar producto/);
    const history=nodes(tree).find(n=>n.type==='details');assert.match(words(history),/ANILLO/);assert.doesNotMatch(words(history),/COMBO/);assert.match(words(history),/historial/);
});
test('delete requires explicit confirmation and changes only the selected status',async()=>{
    const f=mount();await nodes(f.render()).find(n=>n.type==='button'&&words(n)==='Eliminar').props.onClick();assert.equal(f.prompts.length,1);assert.match(f.prompts[0],/COMBO/);assert.match(f.prompts[0],/historial/);
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/products');assert.equal(f.requests[0].body.action,'productStatus');assert.equal(f.requests[0].body.id,'active');assert.equal(f.requests[0].body.status,'INACTIVE');assert.equal(f.reloads(),1);
    const g=mount({approve:false});await nodes(g.render()).find(n=>n.type==='button'&&words(n)==='Eliminar').props.onClick();assert.equal(g.requests.length,0);assert.equal(g.reloads(),0);
});
test('restoration reactivates the same product ID rather than creating a duplicate',async()=>{
    const f=mount();await nodes(f.render()).find(n=>n.type==='button'&&words(n)==='Restaurar producto').props.onClick();assert.equal(f.requests[0].body.id,'inactive');assert.equal(f.requests[0].body.status,'ACTIVE');assert.equal(f.requests[0].body.action,'productStatus');
});
test('collaborators cannot delete or restore, and failed updates show errors instead of success',async()=>{
    const f=mount({canEdit:false});assert.doesNotMatch(words(f.render()),/Restaurar producto|Editar producto/);assert.equal(nodes(f.render()).some(n=>n.type==='button'&&words(n)==='Eliminar'),false);
    const g=mount({ok:false});await nodes(g.render()).find(n=>n.type==='button'&&words(n)==='Eliminar').props.onClick();assert.equal(g.reloads(),0);assert.ok(nodes(g.render()).some(n=>n.props?.role==='alert'));assert.equal(nodes(g.render()).find(n=>n.type==='button'&&words(n)==='Eliminar').props.disabled,false);
});
test('an empty active catalogue remains usable for new entries and restoring archived products',()=>{
    const f=mount({products:[initial[1]]});assert.match(words(f.render()),/No hay productos activos/);assert.match(words(f.render()),/Agregar producto/);assert.match(words(f.render()),/Restaurar producto/);
});
test('compact product list searches immediately without case or accent sensitivity',()=>{
    const f=mount({products:[{id:'1',name:'MICÁ PREMIUM',status:'ACTIVE'},{id:'2',name:'ANILLO',status:'ACTIVE'},initial[1]]});
    let tree=f.render();assert.equal(nodes(tree).filter(n=>n.props?.role==='listitem').length,2);
    nodes(tree).find(n=>n.props?.id==='product-search').props.onChange({target:{value:' mica '}});
    tree=f.render();const rows=nodes(tree).filter(n=>n.props?.role==='listitem');assert.equal(rows.length,1);assert.match(words(rows[0]),/MICÁ PREMIUM/);assert.doesNotMatch(words(rows[0]),/ACTIVO/);assert.match(words(tree),/1 de 2 productos/);assert.equal(f.requests.length,0);
    nodes(tree).find(n=>n.props?.id==='product-search').props.onChange({target:{value:'no existe'}});
    assert.match(words(f.render()),/No se encontraron productos/);
    nodes(f.render()).find(n=>n.props?.id==='product-search').props.onChange({target:{value:''}});
    assert.equal(nodes(f.render()).filter(n=>n.props?.role==='listitem').length,2);
});
test('server uses a status update, never physical deletion, and denies non-master callers before SQL',async()=>{
    const queries=[];const f=load('lib/inventory/products.ts',{'server-only':{},'@/lib/auth/authorization':{},'@/lib/db':{sql:async(parts,...values)=>{queries.push({sql:parts.join('?'),values});return[]}}});
    for(const role of ['OPERATIVE','MANAGER'])await assert.rejects(f.setProductStatus({role},'product','INACTIVE'),/MASTER_REQUIRED/);
    assert.equal(queries.length,0);await f.setProductStatus({role:'MASTER'},'product','INACTIVE');assert.equal(queries.length,1);assert.match(queries[0].sql,/UPDATE products SET status=/);assert.equal(queries[0].values[0],'INACTIVE');assert.equal(queries[0].values[1],'product');assert.doesNotMatch(queries[0].sql,/DELETE|receiving|transfers|exit_lines/);
    const route=readFileSync(new URL('../app/api/products/route.ts',import.meta.url),'utf8');assert.match(route,/await requireUser\(\)/);assert.match(route,/await setProductStatus\(u,/);assert.match(route,/auditRoute\(handlePOST\)/);
});
