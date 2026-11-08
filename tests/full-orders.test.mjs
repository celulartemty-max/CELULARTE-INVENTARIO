import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture({role='MASTER',permission=true,ids=null,branches=[id(1),id(2)],duplicate=false,rows=[]}={}){
 const queries=[];let count=10;
 const code=ts.transpileModule(read('lib/inventory/full-orders.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{Error,Set,Date})(name=>name==='server-only'?{}:name==='@/lib/auth/authorization'?{hasModulePermission:async()=>permission,getAuthorizedBranchIds:async()=>ids}:name==='@/lib/db'?{withTransaction:async fn=>fn({query:async(sql,args)=>{
  queries.push({sql,args});if(sql.startsWith('SELECT id::text FROM branches'))return{rows:branches.map(id=>({id}))};
  if(sql.startsWith('SELECT id FROM full_orders'))return{rows:duplicate?[{id:id(3)}]:[]};
  if(sql.startsWith('INSERT INTO full_orders'))return{rows:[{id:id(3)}]};
  if(sql.startsWith('INSERT INTO inventory_movements'))return{rows:[{id:id(count++)}]};
  return{rows};
 }})}:require(name),mod,mod.exports);
 return{...mod.exports,queries,user:{id:id(9),role}};
}
const body={reference:'81544435',title:'FULL · Micas',expectedPieces:500,branchIds:[id(1),id(2)]};
test('only MASTER with Salidas can create FULL orders, before any database work',async()=>{
 for(const opts of [{role:'OPERATIVE'},{role:'MANAGER'},{permission:false}]){const f=fixture(opts);await assert.rejects(f.createFullOrder(f.user,body));assert.equal(f.queries.length,0);}
});
test('reference, title, positive expected total and unique internal branches are validated',async()=>{
 for(const change of [{reference:''},{title:' '},{branchIds:[]},{branchIds:[id(1),id(1)]},{expectedPieces:0},{expectedPieces:1.5},{expectedPieces:-5}]){const f=fixture();await assert.rejects(f.createFullOrder(f.user,{...body,...change}));assert.equal(f.queries.length,0);}
 const f=fixture({branches:[id(1)]});await assert.rejects(f.createFullOrder(f.user,body));assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
});
test('one FULL order can have either branch alone or both, with independent unique exits and audits',async()=>{
 for(const branches of [[id(1)],[id(2)],[id(1),id(2)]]){
  const f=fixture({branches});assert.equal(await f.createFullOrder(f.user,{...body,branchIds:branches}),id(3));
  assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT INTO full_orders')).length,1);
  const movements=f.queries.filter(q=>q.sql.startsWith('INSERT INTO inventory_movements'));
  assert.equal(movements.length,branches.length);assert.equal(new Set(movements.map(q=>q.args[0])).size,branches.length);
  assert.deepEqual(movements.map(q=>q.args[1]),branches);
  assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT INTO full_order_exits')).length,branches.length);
  assert.equal(f.queries.filter(q=>q.sql.includes('FULL_ORDER_EXIT_CREATED')).length,branches.length);
  assert.ok(f.queries.every(q=>!q.sql.includes('INSERT INTO pos_registration_events')));
 }
});
test('duplicate reference cannot create another order or exit',async()=>{
 const f=fixture({duplicate:true});await assert.rejects(f.createFullOrder(f.user,body),/Ya existe/);assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
});
test('list and detail scope every read to current branch assignments and deny missing module',async()=>{
 const f=fixture({role:'OPERATIVE',ids:[id(1)]});await f.fullOrderRows(f.user,id(3));
 assert.deepEqual(JSON.parse(JSON.stringify(f.queries[0].args)),[[id(1)],id(3),0]);assert.match(f.queries[0].sql,/x.branch_id=ANY/);assert.match(f.queries[0].sql,/m.branch_id=x.branch_id/);
 const empty=fixture({ids:[]});assert.equal((await empty.fullOrderRows(empty.user)).length,0);assert.equal(empty.queries.length,0);
 const denied=fixture({permission:false});await assert.rejects(denied.fullOrderRows(denied.user));assert.equal(denied.queries.length,0);
});
test('product totals use only authorized exits and exclude cancelled movements',async()=>{
 const f=fixture({ids:[id(1)],rows:[{movement_id:id(10)}]});await f.fullOrderProducts(f.user,id(3));
 assert.deepEqual(JSON.parse(JSON.stringify(f.queries[1].args)),[[id(10)]]);assert.match(f.queries[1].sql,/sum\(l.quantity\)/);assert.match(f.queries[1].sql,/status::text<>'CANCELLED'/);
});
test('states distinguish preparation, pending registration, corrections, cancellation and completion',()=>{
 const {fullOrderStatus:s}=fixture();const part=(status,pieces=0)=>({status,pieces});
 assert.equal(s([part('DRAFT')]),'Pendiente');assert.equal(s([part('DRAFT',10)]),'En preparación');
 assert.equal(s([part('CLOSED',10),part('DRAFT')]),'Pendiente de registro');
 assert.equal(s([part('POS_REGISTERED'),part('POS_CORRECTION_PENDING')]),'Pendiente de registro');
 assert.equal(s([part('POS_REGISTERED'),part('POS_RECONCILED')]),'Registrado');assert.match(s([part('CANCELLED')]),/Revisar/);
});
test('entry menu uses requested labels; existing creation and registration routes remain separate',()=>{
 const menu=read('app/(app)/salidas/page.tsx');for(const label of ['Nueva salida','Gestión de Pedidos','/salidas/nueva','/salidas/pedidos'])assert.ok(menu.includes(label));
 assert.match(read('app/api/full-orders/route.ts'),/POST=auditRoute\(create\)/);
 const detail=read('app/(app)/salidas/pedidos/[orderId]/page.tsx');assert.match(detail,/user.role==='MASTER'/);assert.match(detail,/no hay sincronización automática/);
 const migration=read('migrations/20261106_full_orders.sql');assert.doesNotMatch(migration,/DROP|DELETE|UPDATE /);assert.match(migration,/UNIQUE INDEX.*full_orders_reference_unique/);
});
test('management is pending-only and FULL creation lives in Nueva salida',async()=>{
 const list=read('app/(app)/salidas/pedidos/page.tsx');assert.doesNotMatch(list,/NewOrder|Crear pedido|<form/);assert.match(list,/No hay pedidos pendientes/);
 const page=read('app/(app)/salidas/nueva/page.tsx');assert.match(page,/canCreateFull=\{u.role==='MASTER'\}/);
 const form=read('app/(app)/salidas/nueva/exit-new.tsx');assert.match(form,/channel==='MERCADO_LIBRE'&&exitType==='FULL'/);assert.match(form,/isFull\?'\/api\/full-orders':'\/api\/exits'/);assert.match(form,/name="reference"/);assert.match(form,/name="title"/);assert.match(form,/branchIds:f.getAll\('branch'\)/);
 const f=fixture({ids:[id(1)]});await f.fullOrderRows(f.user,undefined,1);const q=f.queries[0];assert.match(q.sql,/pending.branch_id=e.branch_id/);assert.match(q.sql,/\$2::uuid IS NOT NULL OR pending.status::text NOT IN \('POS_REGISTERED','POS_RECONCILED','CANCELLED'\)/);assert.equal(q.args[2],50);
});
test('FULL detail uses compact branch cards and keeps audit and help inside collapsed details',()=>{
 const detail=read('app/(app)/salidas/pedidos/[orderId]/page.tsx');
 assert.equal((detail.match(/<h1>\{order.title\}<\/h1>/g)||[]).length,1);
 assert.doesNotMatch(detail,/Consolidado|piezas capturadas|Aún no hay productos capturados/);
 const start=detail.indexOf('<details className="fullOrderDetails">');assert.ok(start>0);
 assert.ok(detail.indexOf('Folio:')>start);assert.ok(detail.indexOf('no hay sincronización automática')>start);
 assert.doesNotMatch(detail,/<details[^>]*\bopen[ =>]/);
 for(const token of ['fullOrderTotal','fullOrderBranch','Abrir salida →','Ver detalles'])assert.ok(detail.includes(token));
 const css=read('app/(app)/salidas/full-orders.css');assert.match(css,/font-size:26px/);assert.match(css,/min-height:44px/);
});
test('exit capture has a compact FULL heading and collapses the long folio',()=>{
 const page=read('app/(app)/salidas/[id]/page.tsx');assert.match(page,/fullExitHeading/);assert.match(page,/← Pedido/);assert.doesNotMatch(page,/Mercado Libre FULL #| · Salida #/);assert.match(page,/<details><summary>Detalles<\/summary><small>Folio: \{m.folio\}/);
 assert.ok(page.indexOf('await assertBranchAccess')<page.indexOf('FROM full_orders'));assert.match(page,/<ExitEditor movement=\{m\}/);
});
