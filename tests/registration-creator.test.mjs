import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('pending creator comes from original movement/session/order, never confirming actor',()=>{
 const s=read('lib/inventory/system-registration.ts');
 assert.match(s,/creator.name created_by_name/);
 assert.match(s,/COALESCE\(source_m.created_by,source_s.created_by,source_o.created_by\)/);
 assert.match(s,/source_m.id=p.id AND p.kind NOT IN \('RECEIVING','DESTINATION'\)/);
 assert.match(s,/source_s.id=p.id AND p.kind='RECEIVING'/);
 assert.match(s,/source_o.id=p.id AND p.kind='DESTINATION'/);
 assert.match(s,/LEFT JOIN users creator/);
 assert.match(s,/p.branch_id=ANY\(\$1::uuid\[\]\)/);
});
test('registration cards identify creator below branch while preserving folio and confirmation',()=>{
 const s=read('app/(app)/registros/registration-queue.tsx');
 assert.match(s,/Creado por: \{r.created_by_name/);assert.match(s,/Sin nombre disponible/);
 assert.match(s,/Folio: \{r.reference\}/);assert.match(s,/onClick=\{\(\)=>open\(r\)\}/);
});
