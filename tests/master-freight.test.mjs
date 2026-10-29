import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('freight is master-only in data, create form, detail and document API',()=>{
 const service=read('lib/inventory/receiving.ts');
 assert.match(service,/const cost = u.role === 'MASTER' \?/);
 assert.match(service,/x.total, u.role === 'MASTER' \? x.cost : null/);
 assert.match(service,/d.session_id=\$\{sessionId\}::uuid AND \$\{u.role === 'MASTER'\}/);
 const api=read('app/api/receiving/documents/route.ts');
 assert.match(api,/sessionId && u.role !== 'MASTER'/);
 assert.match(api,/!row.order_id && u.role !== 'MASTER'/);
 assert.match(read('app/(app)/entradas/pedidos/receiving-new.tsx'),/canFreight&&<label>Costo/);
 assert.match(read('app/(app)/entradas/pedidos/[id]/receiving-editor.tsx'),/data.canRecount && <section className="card pad receivingFreight"/);
});
