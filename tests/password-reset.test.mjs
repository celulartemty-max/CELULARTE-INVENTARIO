import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path,mocks,globals={}) {
 const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'})',{Buffer,TextEncoder,...globals})(n=>n in mocks?mocks[n]:require(n),mod,mod.exports);return mod.exports;
}
const id='00000000-0000-4000-8000-000000000001',actor={id:'master',role:'MASTER'},body={id,password:'Synthetic-new-password'};
function api(target={id,role:'OPERATIVE',status:'ACTIVE'}) {
 const queries=[],hashes=[];
 const {resetManagedPassword:reset}=load('lib/auth/reset-password.ts',{'server-only':{},bcryptjs:{default:{hash:async(p,cost)=>{hashes.push({p,cost});return 'HASHED_ONLY';}}},'@/lib/db':{withTransaction:async fn=>fn({query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT')?(target?[target]:[]):[]};}})}});
 return {reset,queries,hashes};
}
test('only MASTER can reset and invalid payloads never mutate anything',async()=>{
 for(const role of ['OPERATIVE','MANAGER']){const f=api();assert.equal((await f.reset({...actor,role},body)).status,403);assert.equal(f.queries.length,0);assert.equal(f.hashes.length,0);}
 for(const invalid of [{...body,id:'bad'},{...body,password:'short'},{...body,password:'x'.repeat(73)},{...body,password:'é'.repeat(37)},{...body,password:null},{...body,permissions:[]},{...body,status:'INACTIVE'}]){const f=api();assert.equal((await f.reset(actor,invalid)).status,400);assert.equal(f.queries.length,0);assert.equal(f.hashes.length,0);}
});
test('reset changes only an existing active collaborator credential, hashed at cost 12',async()=>{
 const f=api(),result=await f.reset(actor,body);assert.equal(result.ok,true);assert.equal(f.queries.length,2);
 assert.match(f.queries[0].sql,/FOR UPDATE/);assert.match(f.queries[1].sql,/INSERT INTO user_login_credentials/);
 assert.deepEqual(Array.from(f.queries[1].args),[id,'HASHED_ONLY']);assert.equal(f.hashes[0].cost,12);
 assert.doesNotMatch(f.queries.map(q=>q.sql).join(' '),/DELETE|UPDATE users|receiving_|inventory_/);
 assert.ok(!JSON.stringify(result).includes(body.password));
});
test('missing, inactive and MASTER targets cannot be reset',async()=>{
 for(const [target,status] of [[null,404],[{role:'MASTER',status:'ACTIVE'},403],[{role:'MANAGER',status:'INACTIVE'},409]]){const f=api(target);assert.equal((await f.reset(actor,body)).status,status);assert.equal(f.queries.length,1);}
});
test('route authenticates MASTER, audits reset, returns no-store and bypasses access mutations',()=>{
 const s=read('app/api/users/route.ts'),patch=s.slice(s.indexOf('async function handlePATCH'));
 assert.ok(patch.indexOf('if(!isAdmin(me))')<patch.indexOf('await req.json()'));
 assert.ok(patch.indexOf('resetManagedPassword(me,body)')<patch.indexOf('UPDATE users'));
 assert.match(patch,/Cache-Control':'no-store/);assert.match(s,/PATCH = auditRoute\(handlePATCH\)/);
 assert.match(read('app/(app)/usuarios/page.tsx'),/u.role!=='MASTER'&&u.status==='ACTIVE'&&<ResetPassword/);
});
function ui(fetch) {
 const state=[],refs=[];let cursor=0,refCursor=0;
 const Component=load('app/(app)/usuarios/reset-password.tsx',{react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v;}];},useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});}}},{fetch}).default;
 const render=()=>{cursor=0;refCursor=0;return Component({user:{id,name:'Fixture',email:'fixture@example.invalid'}});};
 function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}}
 const get=predicate=>find(render(),predicate),button=text=>get(n=>n.type==='button'&&n.props.children===text);
 const open=()=>button('Restablecer contraseña').props.onClick();
 const enter=(p,c)=>{get(n=>n.type==='input'&&n.props.minLength===8).props.onChange({target:{value:p}});get(n=>n.type==='input'&&n.props.minLength===undefined).props.onChange({target:{value:c}});};
 const submit=()=>get(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 return {state,get,button,open,enter,submit};
}
test('UI cancellation and mismatched passwords make no request and clear secrets on cancel',async()=>{
 let calls=0;const f=ui(async()=>{calls++;});f.open();f.enter(body.password,'different');await f.submit();assert.equal(calls,0);assert.match(f.state[4],/no coinciden/);
 f.button('Cancelar').props.onClick();assert.equal(f.state[1],'');assert.equal(f.state[2],'');assert.equal(f.get(n=>n.type==='form'),undefined);
});
test('UI sends only selected ID and password, prevents double submit and clears secrets on success',async()=>{
 let resolve,calls=0,payload;const f=ui(async(url,options)=>{calls++;payload=JSON.parse(options.body);return new Promise(r=>{resolve=r;});});
 f.open();f.enter(body.password,body.password);const pending=f.submit();await f.submit();assert.equal(calls,1);assert.deepEqual(payload,body);
 assert.equal(f.button('Cancelar').props.disabled,true);resolve({ok:true,json:async()=>({ok:true})});await pending;
 assert.equal(f.state[1],'');assert.equal(f.state[2],'');assert.equal(f.get(n=>n.type==='form'),undefined);assert.match(f.state[4],/restablecida/);
});
test('UI server and network failures stay visible without claiming success',async()=>{
 for(const response of [async()=>({ok:false,json:async()=>({error:'Sin permiso'})}),async()=>{throw Error('offline');}]){const f=ui(response);f.open();f.enter(body.password,body.password);await f.submit();assert.ok(f.get(n=>n.type==='form'));assert.ok(f.get(n=>n.props?.role==='alert'));assert.equal(f.state[1],body.password);assert.equal(f.state[3],false);}
});
