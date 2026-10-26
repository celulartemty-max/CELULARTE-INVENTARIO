import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const requireModule=createRequire(import.meta.url),ts=requireModule('typescript');

// Synthetic credentials only: no external database, real user or stored password is accessed.
function authFixture(results,legacy=[]){
 const calls=[];
 const sql=async(strings,...values)=>{calls.push({query:strings.join('?'),values});return results.shift()??[]};
 const mod={exports:{}};
 const source=readFileSync(new URL('../lib/auth/credentials.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const req=name=>name==='server-only'?{}:name==='@/lib/db'?{sql}:name==='bcryptjs'?{default:{compare:async(p,h)=>h==='fixture-hash:'+p}}:requireModule(name);
 vm.runInNewContext('(function(require,module,exports){'+code+'})',{process:{env:{AUTH_CREDENTIALS_JSON:JSON.stringify(legacy)}}})(req,mod,mod.exports);
 return {authenticate:mod.exports.authenticate,calls};
}
const user={id:'fixture-user',email:'test@example.invalid',name:'Fixture',role:'MANAGER',primary_branch_id:'fixture-branch'};
test('managed login preserves normalized email, role and branch without writing data',async()=>{
 const {authenticate,calls}=authFixture([[{...user,password_hash:'fixture-hash:correct-password'}]]);
 const result=await authenticate(' TEST@example.invalid ','correct-password');
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{id:user.id,email:user.email,name:user.name,role:user.role,primaryBranchId:user.primary_branch_id});
 assert.equal(calls.length,1);assert.equal(calls[0].values[0],'test@example.invalid');assert.ok(calls.every(c=>c.query.startsWith('SELECT ')));
});
test('incorrect password is rejected and never mutates credentials',async()=>{
 const {authenticate,calls}=authFixture([[{...user,password_hash:'fixture-hash:correct-password'}]]);
 assert.equal(await authenticate(user.email,'incorrect'),null);assert.ok(calls.every(c=>c.query.startsWith('SELECT ')));
});
test('legacy credential fallback still resolves an active user',async()=>{
 const {authenticate,calls}=authFixture([[],[{...user,primary_branch_id:null}]],[{email:user.email,passwordHash:'fixture-hash:correct-password'}]);
 const result=await authenticate(user.email,'correct-password');assert.equal(result.id,user.id);assert.equal(result.primaryBranchId,null);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.query.includes("status::text='ACTIVE'")));
});
test('missing or inactive user cannot log in through legacy fallback',async()=>{
 const {authenticate}=authFixture([[],[]],[{email:user.email,passwordHash:'fixture-hash:correct-password'}]);
 assert.equal(await authenticate(user.email,'correct-password'),null);
});
test('TikTok order Excel still preserves model/color totals and original SKU',()=>{
 const source=ts.createSourceFile('page.tsx',readFileSync(new URL('../app/(app)/etiquetas-tiktok/page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let fn;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='excelOrder')fn=node;ts.forEachChild(node,visit)}visit(source);assert.ok(fn);
 const code=ts.transpileModule(fn.getText(source),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const XLSX=requireModule('xlsx');let workbook,filename;
 const stub={...XLSX,writeFile:(w,n)=>{workbook=w;filename=n}};
 const order={name:'Pedido de prueba',items:[{product_name:'COMBO CASE',variation:'Negro, A57',seller_sku:'ORIG123',qty:3},{product_name:'COMBO CASE',variation:'Rosa, A57',seller_sku:'ORIG456',qty:2}]};
 vm.runInNewContext(code+';excelOrder(order);',{XLSX:stub,order,items:[],Blob,URL});
 assert.equal(filename,'Pedido_de_prueba_PEDIDO.xlsx');
 assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets['Detalle SKU'],{header:1}),[['PRODUCTO','MODELO','COLOR','SKU','CANTIDAD'],['COMBO CASE','A57','Negro','ORIG123',3],['COMBO CASE','A57','Rosa','ORIG456',2]]);
 assert.ok(XLSX.utils.sheet_to_json(workbook.Sheets.Pedido,{header:1}).some(row=>JSON.stringify(row)===JSON.stringify(['A57',3,2,5])));
 const multi={name:'Separados',items:[{id:'a',product_id:'1111111111111111111',product_name:'MISMO NOMBRE',variation:'Negro, A57',seller_sku:'SKU1',qty:3},{id:'b',product_id:'2222222222222222222',product_name:'MISMO NOMBRE',variation:'Negro, A57',seller_sku:'SKU2',qty:7}]};
 vm.runInNewContext(code+';excelOrder(order);',{XLSX:stub,order:multi,items:[],Blob,URL});
 const rows=XLSX.utils.sheet_to_json(workbook.Sheets.Pedido,{header:1});
 assert.equal(rows.filter(row=>row[0]==='MODELO').length,2);
 assert.ok(rows.some(row=>row[0]==='ID de producto: 1111111111111111111'));
 assert.ok(rows.some(row=>row[0]==='ID de producto: 2222222222222222222'));
 assert.deepEqual(rows.filter(row=>row[0]==='TOTAL').map(row=>row.at(-1)),[3,7]);
});
