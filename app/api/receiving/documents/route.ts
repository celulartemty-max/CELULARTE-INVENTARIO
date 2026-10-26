import { requireUser, assertBranchAccess } from '@/lib/auth/authorization';
import { sql, withTransaction } from '@/lib/db';
import { receivingAccess } from '@/lib/inventory/receiving';
import { readReceivingFile } from '@/lib/inventory/receiving-files';
import { z } from 'zod';
export async function POST(req: Request) {
    try {
        const u = await requireUser();
        await receivingAccess(u, true);
        if (Number(req.headers.get('content-length') || 0) > 2900000)
            throw new Error('Archivo demasiado grande. Máximo 2 MB.');
        const f = await req.formData();
        const file = f.get('file');
        if (!(file instanceof File))
            throw new Error('Selecciona un archivo.');
        const orderId = f.get('orderId') ? z.string().uuid().parse(f.get('orderId')) : null;
        const sessionId = f.get('sessionId') ? z.string().uuid().parse(f.get('sessionId')) : null;
        if (Boolean(orderId) === Boolean(sessionId))
            throw new Error('Selecciona pedido o recepción.');
        const { data, mime, filename } = await readReceivingFile(file);
        await withTransaction(async (c) => {
            const owner = await c.query(orderId ? 'SELECT branch_id FROM receiving_orders WHERE id=$1 FOR UPDATE' : 'SELECT branch_id,status FROM receiving_sessions WHERE id=$1 FOR UPDATE', [orderId || sessionId]);
            const row = owner.rows[0];
            if (!row)
                throw new Error('No encontrado.');
            await assertBranchAccess(u, row.branch_id);
            if (sessionId && row.status !== 'DRAFT')
                throw new Error('La recepción está cerrada.');
            const existing = await c.query('SELECT count(*)::int n FROM receiving_documents WHERE order_id=$1 OR session_id=$2', [orderId, sessionId]);
            if (existing.rows[0].n >= 5)
                throw new Error('Máximo 5 archivos por pedido o recepción.');
            await c.query('INSERT INTO receiving_documents(order_id,session_id,filename,mime,data,created_by) VALUES($1,$2,$3,$4,$5,$6)', [orderId, sessionId, filename, mime, data, u.id]);
            await c.query("INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_DOCUMENT_ADDED',$3::jsonb)", [u.id, row.branch_id, JSON.stringify({ orderId, sessionId, filename })]);
        });
        return Response.json({ ok: true });
    }
    catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : 'Error al adjuntar.' }, { status: 400 });
    }
}
export async function GET(req: Request) {
    try {
        const u = await requireUser();
        await receivingAccess(u, true);
        const id = z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
        const r = await sql `SELECT COALESCE(o.branch_id,s.branch_id)::text branch_id FROM receiving_documents d LEFT JOIN receiving_orders o ON o.id=d.order_id LEFT JOIN receiving_sessions s ON s.id=d.session_id WHERE d.id=${id}::uuid`;
        if (!r[0])
            return new Response('No encontrado', { status: 404 });
        await assertBranchAccess(u, String(r[0].branch_id));
        return withTransaction(async (c) => { const q = await c.query('SELECT filename,mime,data FROM receiving_documents WHERE id=$1', [id]); const d = q.rows[0]; return new Response(new Uint8Array(d.data), { headers: { 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${d.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); });
    }
    catch {
        return new Response('Sin acceso', { status: 403 });
    }
}
