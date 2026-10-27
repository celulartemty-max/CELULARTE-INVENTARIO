import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks={}){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{setTimeout,process:{env:{DATABASE_URL:'postgresql://fixture:fixture@localhost/fixture'}},Reflect,Proxy,Promise,Set})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    return mod.exports;
}
const user={id:'00000000-0000-4000-8000-000000000001',role:'MANAGER'},id='00000000-0000-4000-8000-000000000002',branch='00000000-0000-4000-8000-000000000003';
function registrationFixture({permitted=true,pending=true,kind='RECEIVING',side=null,evidence=true,branchAllowed=true}={}){
    const queries=[],calls=[];
    const row={id,kind,side,branch_id:branch,reference:'LUNES'};
    const permissions={requireSystemRegistration:async()=>{if(!permitted)throw Error('Sin permiso')}};
    const mod=load('lib/inventory/system-registration.ts',{
        'server-only':{},'@/lib/auth/special-permissions':permissions,
        '@/lib/auth/authorization':{getAuthorizedBranchIds:async()=>[branch],assertBranchAccess:async()=>{if(!branchAllowed)throw Error('FORBIDDEN_BRANCH')}},
        '@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('WITH pending'))return {rows:pending?[row]:[]};if(sql.includes("action='POS_EVIDENCE_CAPTURED'"))return {rowCount:evidence?1:0,rows:[]};return {rows:[]};}})},
        './receiving':{receivingAction:async(u,b)=>calls.push(['RECEIVING',b])},'./receptions':{registerPos:async()=>calls.push(['RECEPTION'])},'./exits':{registerExitPos:async()=>calls.push(['EXIT'])},'./returns':{registerReturnPos:async()=>calls.push(['RETURN'])},'./transfers':{registerTransferPos:async(u,id,side)=>calls.push(['TRANSFER',side])},
    });
    return {...mod,queries,calls,key:{id,kind,side}};
}
test('special permission blocks pending, history, detail and confirm before database reads',async()=>{
    const f=registrationFixture({permitted:false});
    for(const call of [()=>f.registrationPending(user),()=>f.registrationHistory(user),()=>f.registrationDetail(user,f.key),()=>f.confirmRegistration(user,f.key)])await assert.rejects(call(),/Sin permiso/);
    assert.equal(f.queries.length,0);assert.equal(f.calls.length,0);
});
test('queue is branch-scoped and includes only close-ready registration states, not drafts or foreign-only archives',async()=>{
    const f=registrationFixture();await f.registrationPending(user);
    assert.deepEqual(f.queries[0].args[0],[branch]);assert.match(f.pendingSql,/p.branch_id=ANY\(\$1::uuid\[\]\)/);
    assert.match(f.pendingSql,/s.status='CLOSED'/);assert.doesNotMatch(f.pendingSql,/s.status='ARCHIVED'|s.status='DRAFT'/);
    assert.match(f.pendingSql,/POS_CORRECTION_PENDING/);assert.match(f.pendingSql,/t.destination_pos_registered_at IS NULL/);assert.match(f.pendingSql,/b.name IN \('Treviño','Plaza del Audio'\)/);
});
test('removed pending entry, wrong side, unrelated ID or branch change prevents confirmation',async()=>{
    for(const options of [{pending:false},{branchAllowed:false}]){const f=registrationFixture(options);await assert.rejects(f.confirmRegistration(user,f.key));assert.equal(f.calls.length,0)}
    const f=registrationFixture();await assert.rejects(f.confirmRegistration(user,{...f.key,side:'destination'}));await assert.rejects(f.confirmRegistration(user,{...f.key,id:branch}));assert.equal(f.calls.length,0);
});
test('new receipt confirmation delegates to locked existing state machine, never creates or moves cartons',async()=>{
    const f=registrationFixture();await f.confirmRegistration(user,f.key);
    assert.equal(f.calls[0][0],'RECEIVING');assert.equal(f.calls[0][1].action,'pos');assert.equal(f.calls[0][1].sessionId,id);
    assert.ok(f.queries.every(q=>!q.sql.startsWith('UPDATE')&&!q.sql.startsWith('INSERT')));
});
test('legacy registrations require current user photo evidence and transfer sides stay independent',async()=>{
    const f=registrationFixture({kind:'TRANSFER',side:'destination',evidence:false});await assert.rejects(f.confirmRegistration(user,f.key),/foto/);assert.equal(f.calls.length,0);
    const allowed=registrationFixture({kind:'TRANSFER',side:'destination'});await allowed.confirmRegistration(user,allowed.key);assert.deepEqual(allowed.calls,[['TRANSFER','destination']]);
    const query=allowed.queries.find(q=>q.sql.includes("action='POS_EVIDENCE_CAPTURED'"));assert.deepEqual(Array.from(query.args),[user.id,id,branch]);
});
test('bitacora permission and branch restrictions apply to reads and payloads are recursively redacted',async()=>{
    let permitted=false,queried=false;
    const f=load('lib/audit/read.ts',{
        'server-only':{},
        '@/lib/auth/special-permissions':{requireAuditLog:async()=>{if(!permitted)throw Error('Sin permiso')}},
        '@/lib/auth/authorization':{getAuthorizedBranchIds:async()=>[branch]},
        '@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{
            queried=true;assert.deepEqual(args[0],[branch]);assert.match(sql,/a.branch_id=ANY/);
            return {rows:[{previous_value:{password_hash:'secret',nested:{image:'data:image/jpeg;base64,secret',name:'ANTES'}},new_value:{quantity:0}}]};
        }})},
    });
    await assert.rejects(f.auditLog(user,{}),/Sin permiso/);assert.equal(queried,false);permitted=true;
    const result=await f.auditLog(user,{});assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(result.rows[0].new_value.quantity,0);assert.equal(result.rows[0].previous_value.nested.name,'ANTES');
});
test('request actor is isolated across overlapping asynchronous requests and cleared afterwards',async()=>{
    const f=load('lib/audit/context.ts',{'server-only':{}}),seen=[];
    await Promise.all([f.withAuditActor('A',async()=>{await new Promise(r=>setTimeout(r,8));seen.push(f.auditActor())}),f.withAuditActor('B',async()=>{await new Promise(r=>setTimeout(r,1));seen.push(f.auditActor())})]);
    assert.deepEqual(seen,['B','A']);assert.equal(f.auditActor(),undefined);
});
test('database attaches transaction-local actor to HTTP queries and rolls back failed transactional writes',async()=>{
    let actor='A';const batches=[],commands=[];
    function raw(parts,...values){return {parts:[...parts],values};}
    raw.transaction=async queries=>{batches.push(queries);return [[],[{actor:queries[0].values[0]}]]};
    class Pool{async connect(){return {query:async(...args)=>{commands.push(args);return {rows:[]}},release(){}}}async end(){}}
    const f=load('lib/db.ts',{'server-only':{},'@/lib/audit/context':{auditActor:()=>actor},'@neondatabase/serverless':{neon:()=>raw,Pool}});
    const r=await f.sql`SELECT ${42}`;assert.equal(r[0].actor,'A');assert.match(batches[0][0].parts.join(''),/set_config\('app.audit_user_id'/);assert.equal(batches[0][1].values[0],42);
    actor='B';await assert.rejects(f.withTransaction(async()=>{throw Error('fixture rollback')}));
    assert.deepEqual(commands[0],['BEGIN']);assert.deepEqual(JSON.parse(JSON.stringify(commands[1])),["SELECT set_config('app.audit_user_id',$1,true)",['B']]);assert.deepEqual(commands[2],['ROLLBACK']);
});
test('every authenticated write route has an explicit actor boundary, including labels and users',()=>{
    for(const path of readdirSync(new URL('../app/api/',import.meta.url),{recursive:true}).filter(p=>p.endsWith('route.ts')&&!p.startsWith('auth/'))){
        const source=readFileSync(new URL('../app/api/'+path,import.meta.url),'utf8');
        if(/(async function handle(POST|PATCH|DELETE)|export const (POST|PATCH|DELETE))/.test(source))assert.match(source,/auditRoute\(/,path);
        assert.doesNotMatch(source,/export async function (POST|PATCH|DELETE)\(/,path);
    }
});
test('registration is guarded in every existing server confirmation path, not just the new screen',()=>{
    for(const [path,fn] of [['exits','registerExitPos'],['returns','registerReturnPos'],['transfers','registerTransferPos'],['receptions','registerPos']]){
        const source=readFileSync(new URL('../lib/inventory/'+path+'.ts',import.meta.url),'utf8');const implementation=source.slice(source.indexOf('export async function '+fn));assert.ok(implementation.indexOf('requireSystemRegistration')<implementation.indexOf('withTransaction'));
    }
});
test('a stale session cannot retain disabled account, role or primary-branch access',async()=>{
    let active=true;
    const f=load('lib/auth/authorization.ts',{'server-only':{},'next/navigation':{redirect:()=>{throw Error('LOGIN')}},'./session':{getSession:async()=>({user:{id:user.id,role:'MASTER',primaryBranchId:'old'}})},'@/lib/db':{sql:async()=>active?[{id:user.id,name:'Encargado',email:'fixture@example.invalid',role:'OPERATIVE',status:'ACTIVE',primary_branch_id:branch}]:[]}});
    assert.equal((await f.requireUser()).role,'OPERATIVE');assert.equal((await f.requireUser()).primaryBranchId,branch);active=false;await assert.rejects(f.requireUser(),/LOGIN/);
});
