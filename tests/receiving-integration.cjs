// Isolated branch only. Connection is read from stdin, never logged or stored.
const {createInterface}=require('node:readline');
const rl=createInterface({input:process.stdin});
rl.once('line',async line=>{rl.close();let pool;
try{
 const url=JSON.parse(line).url;if(!url||!url.includes('ep-'))throw Error('Test connection required');
 const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),assert=require('node:assert/strict');
 const neon=require('@neondatabase/serverless');neon.neonConfig.webSocketConstructor=WebSocket;pool=new neon.Pool({connectionString:url});
 const client=await pool.connect();await client.query('BEGIN');
 const db={sql:async(strings,...args)=>(await client.query(strings.reduce((s,x,i)=>s+x+(i<args.length?'$'+(i+1):''),''),args)).rows,withTransaction:async fn=>{await client.query('SAVEPOINT action');try{return await fn(client)}catch(e){await client.query('ROLLBACK TO SAVEPOINT action');throw e}}};
 const auth={hasModulePermission:async()=>true,assertBranchAccess:async(u,b)=>{if(u.role!=='MASTER'&&b!==u.primaryBranchId)throw Error('FORBIDDEN_BRANCH')}};
 function load(p){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const req=s=>s==='server-only'?{}:s==='@/lib/db'?db:s==='@/lib/auth/authorization'?auth:s==='./receiving-validation'?load('lib/inventory/receiving-validation.ts'):require(s);vm.runInNewContext('(function(require,module,exports){'+code+'})',{console,Set,JSON})(req,mod,mod.exports);return mod.exports;}
 const api=load('lib/inventory/receiving.ts');const [u]=(await client.query("SELECT id::text,email,name,role::text FROM users WHERE role='MASTER' LIMIT 1")).rows;
 const branch=(await client.query("SELECT id::text FROM branches WHERE name='Treviño'")).rows[0].id;const product=(await client.query("SELECT id::text FROM products WHERE status='ACTIVE' LIMIT 1")).rows[0].id;
 const create=total=>api.receivingAction(u,{action:'create',branchId:branch,reference:'INTEGRATION',date:'2026-10-25',total,cost:100,currency:'MXN',notes:''});
 const a=await create(9),b=await create(1);const packing={reference:'INTEGRATION-'+Date.now(),warnings:[],boxes:Array.from({length:10},(_,i)=>({number:String(i+1),items:[{model:'A57',color:'NEGRO',expected:60}]}))};
 await api.receivingAction(u,{action:'order',sessionId:a.id,productId:product,shipping:'AIR',marking:'PER',packing});
 let view=await api.receivingView(u,a.id);const boxes=view.pending.map(x=>x.id);
 await api.receivingAction(u,{action:'arrive',sessionId:a.id,boxIds:boxes.slice(0,9)});
 await assert.rejects(()=>api.receivingAction(u,{action:'arrive',sessionId:b.id,boxIds:[boxes[0]]}));
 view=await api.receivingView(u,a.id);assert.equal(view.boxes.length,9);assert.equal(view.pending.length,1);
 assert.ok(view.items.every(l=>l.counted===null&&l.expected===null));
 const operative={...u,role:'OPERATIVE',primaryBranchId:branch};const blind=await api.receivingView(operative,a.id);assert.ok(blind.items.every(l=>!Object.hasOwn(l,'expected')));assert.equal(blind.cost,null);assert.equal(blind.documents.length,0);
 await assert.rejects(()=>api.receivingAccess(operative,true));
 await assert.rejects(()=>api.receivingAction(u,{action:'close',sessionId:a.id}));
 for(const box of view.boxes){const lines=view.items.filter(l=>l.carton_id===box.id).map(l=>({id:l.id,quantity:0}));await api.receivingAction(operative,{action:'count',sessionId:a.id,boxId:box.id,lines,notes:''});}
 await api.receivingAction(u,{action:'close',sessionId:a.id});await api.receivingAction(u,{action:'pos',sessionId:a.id});
 await assert.rejects(()=>api.receivingAction(u,{action:'reopenBox',sessionId:a.id,boxId:boxes[0]}));
 await api.receivingAction(u,{action:'arrive',sessionId:b.id,boxIds:[boxes[9]]});
 const later=await api.receivingView(u,b.id);assert.equal(later.boxes[0].reference,packing.reference);
 await client.query('ROLLBACK');client.release();console.log('PASS: actual service integration: partial 9/10, separate receipts, blind payloads, zero, duplicates, permissions, close and POS. Fixtures rolled back.');
}catch(e){console.error('Integration failed:',e.message);process.exitCode=1;}finally{if(pool)await pool.end();}
});
