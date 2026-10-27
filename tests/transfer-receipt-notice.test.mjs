import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,mocks){
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    return mod.exports;
}
function receiptFixture(branches){
    const queries=[],rows=[{id:'incoming'}];
    const f=load('lib/inventory/transfer-receipts.ts',{'server-only':{},'@/lib/auth/authorization':{getAuthorizedBranchIds:async()=>branches},'@/lib/db':{sql:async(parts,...values)=>{queries.push({sql:parts.join('?'),values});return rows}}});
    return {...f,queries,rows};
}
test('users without a branch never read incoming transfers',async()=>{
    const f=receiptFixture([]);assert.equal((await f.pendingTransferReceipts({})).length,0);assert.equal(f.queries.length,0);
});
test('incoming queue scopes only by destination, including current temporary assignments',async()=>{
    const branches=['plaza','temporary-trevino'],f=receiptFixture(branches);
    assert.equal(await f.pendingTransferReceipts({}),f.rows);
    const q=f.queries[0];assert.deepEqual(q.values,[branches,branches]);
    assert.match(q.sql,/t.destination_branch_id=ANY/);assert.doesNotMatch(q.sql,/t.origin_branch_id=ANY/);
    assert.match(q.sql,/t.status::text='WAITING_RECEIPT'/);assert.match(q.sql,/t.received_at IS NULL/);
    assert.match(q.sql,/d.name IN \('Treviño','Plaza del Audio'\)/);
    assert.doesNotMatch(q.sql,/PENDING_POS|RECEIVED_WITH_DIFFERENCES|DRAFT|COMPLETED/);
});
test('MASTER sees internal incoming transfers across branches without a fake primary branch',async()=>{
    const f=receiptFixture(null);await f.pendingTransferReceipts({role:'MASTER'});assert.deepEqual(f.queries[0].values,[null,null]);
});
function ui(rows){return load('app/(app)/dashboard/transfer-receipt-notice.tsx',{
    'next/link':{default:props=>React.createElement('a',props,props.children)},
    '@/lib/auth/authorization':{requireUser:async()=>({id:'actor'})},
    '@/lib/inventory/transfer-receipts':{pendingTransferReceipts:async()=>rows},
})}
test('no incoming transfers means no empty notice taking dashboard space',async()=>{
    assert.equal(await ui([]).default(),null);
});
test('one incoming transfer links directly to physical receipt, never POS confirmation',async()=>{
    const html=renderToStaticMarkup(await ui([{id:'incoming-id',origin:'Treviño',destination:'Plaza del Audio'}]).default());
    assert.match(html,/href="\/traspasos\/incoming-id"/);assert.match(html,/Tienes un traspaso por recibir/);assert.match(html,/Ver traspaso/);assert.doesNotMatch(html,/href="\/registros/);
});
test('multiple incoming transfers link to a dedicated destination-only receipt list',async()=>{
    const rows=[{id:'one',folio:'T-1',origin:'Treviño',destination:'Plaza del Audio'},{id:'two',folio:'T-2',origin:'Treviño',destination:'Plaza del Audio'}];
    const f=ui(rows),html=renderToStaticMarkup(await f.default());
    assert.match(html,/2 traspasos por recibir/);assert.match(html,/view=transfers-receive/);
    const list=renderToStaticMarkup(await f.TransferReceiptList({user:{id:'actor'}}));assert.match(list,/\/traspasos\/one/);assert.match(list,/\/traspasos\/two/);assert.match(list,/recepción física/);
});
test('dashboard places incoming notice before greeting and keeps registration separate',()=>{
    const source=readFileSync(new URL('../app/(app)/dashboard/page.tsx',import.meta.url),'utf8');
    assert.ok(source.indexOf('<TransferReceiptNotice/>')<source.indexOf('<section className="dashTop">'));
    assert.ok(source.includes('<RegistrationNotice/>'));
    const movements=readFileSync(new URL('../app/(app)/movimientos/page.tsx',import.meta.url),'utf8');assert.match(movements,/if\(sp.view==='transfers-receive'\)return <TransferReceiptList user=\{user\}/);
});
