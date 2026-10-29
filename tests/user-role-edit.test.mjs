import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('role changes are master-admin only, restricted to operative/manager and protect master accounts',()=>{
 const s=read('app/api/users/route.ts');const patch=s.slice(s.indexOf('async function handlePATCH'));
 assert.ok(patch.indexOf('if(!isAdmin(me))')<patch.indexOf('await req.json()'));
 assert.match(patch,/\['OPERATIVE','MANAGER'\].includes\(role\)/);
 assert.match(patch,/target\[0\].role==='MASTER'/);
 assert.match(patch,/UPDATE users SET role=.*AND role<>'MASTER'/);
 assert.match(s,/PATCH = auditRoute\(handlePATCH\)/);
});
test('access editor exposes the role selector and saves existing access together',()=>{
 const s=read('app/(app)/usuarios/page.tsx');
 assert.match(s,/Rol del usuario/);assert.match(s,/value="MANAGER">Encargado/);
 assert.match(s,/u.role==='MASTER'\?\{\}:\{role:u.role\}/);
 assert.match(s,/JSON.stringify\(editing\)/);assert.match(s,/Rol, sucursal y permisos actualizados/);
});
