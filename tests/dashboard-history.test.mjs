import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('home no longer shows or fetches recent movements, but retains actionable notices',()=>{
 const s=read('app/(app)/dashboard/page.tsx');
 assert.doesNotMatch(s,/Movimientos recientes|recentV2Row|LIMIT 8/);
 assert.match(s,/<RegistrationNotice\//);assert.match(s,/<TransferReceiptNotice\//);assert.match(s,/Acciones rápidas/);
});
test('More links to history with existing movement permission and desktop has no dead dashboard anchor',()=>{
 assert.match(read('app/(app)/mobile-nav.tsx'),/can\("MOVIMIENTOS"\)&&<Link href="\/movimientos" onClick=\{closeMenus\}>Historial/);
 const s=read('app/(app)/layout.tsx');assert.match(s,/href="\/movimientos">Historial/);assert.doesNotMatch(s,/dashboard#movimientos/);
});
