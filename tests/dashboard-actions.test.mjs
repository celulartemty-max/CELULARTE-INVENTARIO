import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('new reception directly opens creation without mixing the pending list',()=>{
 assert.match(read('app/(app)/entradas/nueva/page.tsx'),/pedidos\?new=1/);
 const s=read('app/(app)/entradas/pedidos/page.tsx');assert.match(s,/newReceipt\?\[\]:await receivingOverview/);assert.match(s,/!newReceipt&&/);assert.match(s,/expanded\//);
 assert.match(read('app/(app)/entradas/pedidos/receiving-new.tsx'),/open=\{expanded\}/);
});
test('pending receipt counts include unidentified boxes and only unfinished own-branch cartons',()=>{
 const s=read('lib/inventory/receipt-pending.ts');assert.match(s,/s.status='DRAFT'/);assert.match(s,/s.total_boxes >/);assert.match(s,/voided_at IS NULL/);assert.match(s,/NOT o.is_foreign/);assert.match(s,/o.destination_branch_id=s.branch_id/);assert.match(s,/b.counted_at IS NULL/);
 assert.match(read('app/(app)/entradas/pedidos/page.tsx'),/r.pending_count===true/);
});
test('exit dashboard and destination list use drafts, never completed or POS-only work',()=>{
 const s=read('app/(app)/dashboard/page.tsx');assert.match(s,/Salidas<br\/>en proceso/);assert.match(s,/view=exits-open/);assert.match(s,/m.movement_type='EXIT' AND m.status::text='DRAFT'/);
 assert.match(read('app/(app)/movimientos/page.tsx'),/type==='EXIT'&&status==='DRAFT'/);
});
