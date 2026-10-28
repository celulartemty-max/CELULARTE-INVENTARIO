import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url), ts = require('typescript');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORIGIN=id(1),DEST=id(2),ORDER=id(3),BOX=id(4),BOX2=id(5),LINE=id(6),SESSION=id(7);
const manager={id:id(8),role:'MANAGER',primaryBranchId:DEST};
function moduleFrom(path,mocks={}) {
    const code=ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const mod={exports:{}};
    vm.runInNewContext('(function(require,module,exports){'+code+'})',{Date,Set})(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
    return mod.exports;
}
function fixture({allowed=[DEST],permission=true,confirmed=true,physical=true,counted=false}={}) {
    const queries=[],audit=[]; let quantities;
    const order={id:ORDER,branch_id:ORIGIN,destination_branch_id:DEST,reference:'JAPS-20'};
    const box={id:BOX,session_id:physical?SESSION:null,branch_id:ORIGIN,carton_number:'1',counted_at:counted?'2026-10-27':null};
    const query=async(sql,args=[])=>{
        queries.push({sql,args});
        const result=rows=>({rows,rowCount:rows.length});
        if(sql.startsWith('SELECT * FROM receiving_orders'))return result([order]);
        if(sql.startsWith('SELECT b.id,b.session_id,s.branch_id'))return result(args[1].filter(v=>[BOX,BOX2].includes(v)).map(v=>({...box,id:v})));
        if(sql.startsWith('INSERT INTO receiving_destination_arrivals'))return result(args[1].map(v=>({carton_id:v})));
        if(sql.startsWith('SELECT b.* FROM receiving_cartons'))return result(confirmed&&args[0]===BOX?[box]:[]);
        if(sql.startsWith('SELECT id FROM receiving_items'))return result([{id:LINE}]);
        if(sql.startsWith('SELECT id,counted FROM receiving_items'))return result([{id:LINE,counted:12}]);
        if(sql.startsWith('SELECT b.id,b.carton_number,b.counted_at'))return result([{...box,arrived:confirmed?BOX:null}]);
        if(sql.startsWith('SELECT 1 FROM receiving_items'))return result([]);
        if(sql.startsWith('SELECT count(*)::int n FROM receiving_items'))return result([{n:0}]);
        if(sql.startsWith('SELECT 1 FROM receiving_destination_arrivals'))return result(confirmed?[{ok:1}]:[]);
        if(sql.startsWith('UPDATE receiving_items l SET counted'))quantities=JSON.parse(args[0]);
        if(sql.startsWith('INSERT INTO audit_events'))audit.push(JSON.parse(args[3]));
        return result([]);
    };
    const mod=moduleFrom('lib/inventory/receiving-destination.ts',{
        'server-only':{},'@/lib/db':{withTransaction:fn=>fn({query})},
        '@/lib/auth/authorization':{assertBranchAccess:async(u,branch)=>{if(allowed!==null&&!allowed.includes(branch))throw Error('FORBIDDEN_BRANCH')},getAuthorizedBranchIds:async()=>allowed},
        './receiving':{receivingAccess:async(u,review)=>{if(!permission||(review&&!['MASTER','MANAGER'].includes(u.role)))throw Error('Sin permiso')}},
        './receiving-validation':moduleFrom('lib/inventory/receiving-validation.ts'),
        './packing-reset':moduleFrom('lib/inventory/packing-reset.ts',{'server-only':{}})
    });
    return {...mod,queries,audit,quantities:()=>quantities};
}
const action=(action,extra={})=>({action,orderId:ORDER,boxId:BOX,...extra});
test('destination count authorizes destination, not the source branch, and module access is required',async()=>{
    for(const opts of [{allowed:[ORIGIN]},{permission:false}]) {
        const f=fixture(opts);await assert.rejects(f.destinationAction(manager,action('count',{lines:[{id:LINE,quantity:1}]})));
        assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE')),false);
    }
});
test('unconfirmed boxes cannot be counted, edited, reopened or packed',async()=>{
    const packing={reference:'JAPS-20',warnings:[],boxes:[{number:'1',items:[{model:'A06',color:'NEGRO',expected:10}]}]};
    for(const a of ['count','saveCount','addItem','reopenBox','packing']) {
        const f=fixture({confirmed:false});
        await assert.rejects(f.destinationAction({...manager,role:'MASTER'},action(a,{lines:[{id:LINE,quantity:1}],model:'A06',color:'AZUL',packing})),/confirma|confirmada/i);
        assert.equal(f.queries.some(q=>/^(INSERT INTO receiving_items|UPDATE)/.test(q.sql)),false);
    }
});
test('partial arrival confirms only selected cartons and never changes original receipt links',async()=>{
    const f=fixture();await f.destinationAction(manager,action('confirmArrival',{boxIds:[BOX]}));
    const insert=f.queries.find(q=>q.sql.startsWith('INSERT INTO receiving_destination_arrivals'));
    assert.deepEqual(Array.from(insert.args[1]),[BOX]);assert.equal(insert.args[2],DEST);
    assert.ok(insert.sql.includes('ON CONFLICT(carton_id) DO NOTHING'));
    assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE receiving_cartons')),false);
});
test('arrival rejects duplicates, foreign-order IDs and boxes not physically received at origin',async()=>{
    for(const [opts,ids] of [[{},[BOX,BOX]],[{},[id(99)]],[{physical:false},[BOX]]]) {
        const f=fixture(opts);await assert.rejects(f.destinationAction(manager,action('confirmArrival',{boxIds:ids})));
        assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false);
    }
    await assert.rejects(fixture().destinationAction({...manager,role:'OPERATIVE'},action('confirmArrival',{boxIds:[BOX]})),/permiso/);
});
test('draft count preserves null, final count rejects null and accepts real zero; no origin status gate',async()=>{
    const f=fixture();await f.destinationAction(manager,action('saveCount',{lines:[{id:LINE,quantity:null}]}));assert.equal(f.quantities()[0].quantity,null);
    await assert.rejects(f.destinationAction(manager,action('count',{lines:[{id:LINE,quantity:null}]})));
    await f.destinationAction(manager,action('count',{lines:[{id:LINE,quantity:0}]}));assert.equal(f.quantities()[0].quantity,0);
    assert.ok(f.queries.some(q=>q.sql.includes('counted_at=now()')));
    assert.equal(f.queries.some(q=>q.sql.includes("status='DRAFT'")),false);
});
test('count rejects missing, duplicated and unrelated item IDs',async()=>{
    for(const lines of [[],[{id:id(99),quantity:1}],[{id:LINE,quantity:1},{id:LINE,quantity:2}]]) {
        const f=fixture();await assert.rejects(f.destinationAction(manager,action('count',{lines})));
        assert.equal(f.queries.some(q=>q.sql.startsWith('UPDATE')),false);
    }
});
test('completed cartons block edits and only MASTER can reopen with audit of previous quantities',async()=>{
    await assert.rejects(fixture({counted:true}).destinationAction(manager,action('addItem',{model:'A06',color:''})),/terminado/);
    await assert.rejects(fixture({counted:true}).destinationAction(manager,action('reopenBox')),/administrador/);
    const f=fixture({counted:true});await f.destinationAction({...manager,role:'MASTER'},action('reopenBox'));
    assert.equal(f.audit[0].previous[0].counted,12);
});
test('destination documents require reviewer, destination branch and confirmed arrival',async()=>{
    for(const opts of [{allowed:[ORIGIN]},{confirmed:false}]) await assert.rejects(fixture(opts).destinationDocumentBranch({query:async(sql)=>{
        if(sql.startsWith('SELECT *'))return {rows:[{id:ORDER,branch_id:ORIGIN,destination_branch_id:DEST}]};return {rows:[],rowCount:0};
    }},manager,ORDER));
});
test('incoming list scope filters destination IDs rather than original branch',async()=>{
    const f=fixture();await f.destinationOrders(manager);
    const q=f.queries[0];assert.ok(q.sql.includes('o.destination_branch_id=ANY($1::uuid[])'));assert.deepEqual(q.args[0],[DEST]);
});
test('receipt overview nests a destination into its original session without adding to the physical total',async()=>{
    const queries=[];
    const mod=moduleFrom('lib/inventory/receiving-overview.ts',{
        'server-only':{},'@/lib/auth/authorization':{getAuthorizedBranchIds:async()=>[DEST]},'./receiving':{receivingAccess:async()=>{}},
        '@/lib/db':{withTransaction:fn=>fn({query:async(sql,args)=>{
            queries.push({sql,args});
            return {rows:queries.length===1?[{id:SESSION,total_boxes:43,arrived:43,counted:null,can_open:false}]:[{session_id:SESSION,order_id:ORDER,boxes:5,can_open:true},{session_id:id(99),order_id:ORDER,boxes:2,can_open:true}]};
        }})}
    });
    const rows=await mod.receivingOverview(manager);
    assert.equal(rows.length,1);assert.equal(rows[0].total_boxes,43);assert.equal(rows[0].arrived,43);assert.equal(rows[0].destinations.length,1);assert.equal(rows[0].destinations[0].boxes,5);
    assert.deepEqual(queries[0].args[0],[DEST]);assert.ok(queries[0].sql.includes('EXISTS('));
    assert.match(queries[0].sql,/ELSE NULL END counted/);assert.match(queries[1].sql,/GROUP BY b.session_id,o.id/);
    assert.ok(queries.every(q=>q.sql.includes('$1::uuid[] IS NULL')));assert.ok(queries.every(q=>!q.sql.includes('receiving_items')));
});
test('receipt overview refuses requests without receiving module permission before reading receipts',async()=>{
    let queried=false;
    const mod=moduleFrom('lib/inventory/receiving-overview.ts',{'server-only':{},'@/lib/auth/authorization':{getAuthorizedBranchIds:async()=>[]},'./receiving':{receivingAccess:async()=>{throw Error('Sin permiso')}},'@/lib/db':{withTransaction:()=>{queried=true}}});
    await assert.rejects(mod.receivingOverview(manager),/Sin permiso/);assert.equal(queried,false);
});
