import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path,mocks={}){const mod={exports:{}};const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Set,Map})(n=>mocks[n]??require(n),mod,mod.exports);return mod.exports;}
function fixture({role='MASTER',creator='other',status='DRAFT',registered=null,lines=false,full=false,permission=true,branch=true}={}){
 const queries=[];const {discardEmptyExit}=load('lib/inventory/discard-exit.ts',{'server-only':{},'@/lib/auth/authorization':{hasModulePermission:async()=>permission,assertBranchAccess:async()=>{if(!branch)throw Error('DENIED');}},'@/lib/db':{withTransaction:async fn=>fn({query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('FOR UPDATE')?[{id:'movement',branch_id:'branch',created_by:creator,status,pos_registered_at:registered}]:sql.includes('FROM exit_lines')?(lines?[{}]:[]):sql.includes('FROM full_order_exits')?(full?[{}]:[]):[]};}})}});
 return {queries,run:()=>discardEmptyExit({id:'me',role},'movement')};
}
test('discard locks an empty standalone draft and soft-cancels with audit, never deletes',async()=>{const f=fixture();await f.run();assert.match(f.queries[0].sql,/movement_type='EXIT' FOR UPDATE/);assert.equal(f.queries.filter(q=>q.sql.startsWith('UPDATE')).length,1);assert.match(f.queries.at(-1).sql,/EMPTY_EXIT_DISCARDED/);assert.ok(f.queries.every(q=>!q.sql.includes('DELETE')));});
test('nonempty, registered, closed and FULL exits cannot be discarded',async()=>{for(const opts of [{lines:true},{registered:'today'},{status:'CLOSED'},{status:'CANCELLED'},{full:true}]){const f=fixture(opts);await assert.rejects(f.run());assert.ok(f.queries.every(q=>!q.sql.startsWith('UPDATE')));}});
test('discard enforces module, branch and creator or MASTER independently',async()=>{for(const opts of [{permission:false},{branch:false},{role:'OPERATIVE',creator:'other'}]){const f=fixture(opts);await assert.rejects(f.run());assert.ok(f.queries.every(q=>!q.sql.startsWith('UPDATE')));}await fixture({role:'OPERATIVE',creator:'me'}).run();});
test('grouping combines only identical FULL ids in authorized input and preserves standalone drafts',()=>{const {groupPendingExitRows:g}=load('lib/inventory/group-exit-rows.ts');const a={id:'a',full_order_id:'full1',branch:'Plaza'},b={id:'b',full_order_id:'full1',branch:'Treviño'},c={id:'c',branch:'Treviño'};const result=g([a,b,c]);assert.equal(result.length,2);assert.equal(result[0].branch,'Plaza + Treviño');assert.equal(g([b,c])[0].branch,'Treviño');assert.equal(a.branch,'Plaza');assert.equal(g([a,{...b,full_order_id:'full2'}]).length,2);});
test('discard confirmation and pending grouping preserve history and branch-scoped filtering',()=>{const page=read('app/(app)/movimientos/page.tsx');assert.ok(page.indexOf('const filteredRows')<page.indexOf('const exitIds'));assert.match(page,/groupPendingExitRows\(filteredRows/);assert.match(page,/view==='exits-open'/);assert.match(page,/r.empty_exit&&!r.full_order_id/);const ui=read('app/(app)/movimientos/discard-exit.tsx');assert.match(ui,/confirm\(/);assert.match(ui,/router.refresh\(\)/);assert.match(read('app/api/exits/route.ts'),/case'discardEmpty':await discardEmptyExit/);});
test('dashboard counts FULL once and standalone exits separately for master and scoped branches',()=>{
 const page=read('app/(app)/dashboard/page.tsx');
 assert.match(page,/count\(DISTINCT COALESCE\(x.order_id,m.id\)\) FILTER\(WHERE m.movement_type='EXIT' AND m.status::text='DRAFT'\)/);
 assert.match(page,/count\(DISTINCT COALESCE\(full_order_id,id\)\) FILTER\(WHERE movement_type='EXIT' AND status::text='DRAFT'\)/);
 assert.match(page,/SELECT m\.\*,x.order_id full_order_id/);assert.match(page,/m.branch_id=ANY\(\$\{branches\}::uuid\[\]\)/);
 assert.equal((page.match(/LEFT JOIN full_order_exits x ON x.movement_id=m.id/g)||[]).length,2);
});
