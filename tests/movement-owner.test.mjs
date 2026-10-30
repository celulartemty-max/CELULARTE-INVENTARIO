import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exports={};vm.runInNewContext(ts.transpileModule(read('lib/inventory/movement-owner.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const pending=exports.isMyPendingMovement;
test('my pending movements match creator identity, not name, across exits transfers and returns',()=>{
 for(const type of ['EXIT','TRANSFER','RETURN_ML','RETURN_TIKTOK','RETURN_CUSTOMER']){
  assert.equal(pending({created_by:'me',type,status:'DRAFT'},'me'),true);
  assert.equal(pending({created_by:'other',type,status:'DRAFT'},'me'),false);
 }
 assert.equal(pending({created_by:'me',type:'RECEPTION',status:'DRAFT'},'me'),false);
});
test('completed and cancelled work is not pending; receipt and POS work remains pending',()=>{
 for(const status of ['COMPLETED','CANCELLED','POS_REGISTERED','POS_RECONCILED'])assert.equal(pending({created_by:'me',type:'TRANSFER',status},'me'),false);
 for(const status of ['WAITING_RECEIPT','PENDING_POS','RECEIVED_WITH_DIFFERENCES'])assert.equal(pending({created_by:'me',type:'TRANSFER',status},'me'),true);
 assert.equal(pending({created_by:'me',type:'EXIT',status:'CLOSED',pos_registered_at:'done'},'me'),false);
 assert.equal(pending({created_by:'me',type:'EXIT',status:'CLOSED',pos_registered_at:null},'me'),true);
});
test('owner filters run after authorized branch queries, retain view and use logged-in user',()=>{
 const s=read('app/(app)/movimientos/page.tsx');
 assert.match(s,/getAuthorizedBranchIds\(user\)/);assert.match(s,/m.branch_id=ANY/);assert.match(s,/t.destination_branch_id=ANY/);
 assert.match(s,/isMyPendingMovement\(r,user.id\)/);assert.match(s,/m.created_by/);assert.match(s,/r.user_name/);
 assert.match(s,/Mis pendientes/);assert.match(s,/URLSearchParams/);assert.match(s,/aria-current/);
 assert.doesNotMatch(s,/`\$\{String\(r.folio\)\} ·/);
});
