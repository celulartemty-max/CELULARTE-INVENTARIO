import { auditRoute } from '@/lib/audit/route';
import { requireUser, assertBranchAccess } from '@/lib/auth/authorization';
import { withTransaction } from '@/lib/db';
import { destinationDocumentBranch } from '@/lib/inventory/receiving-destination';
import { receivingAccess } from '@/lib/inventory/receiving';
import { readReceivingFile } from '@/lib/inventory/receiving-files';
import { z } from 'zod';
async function handlePOST(req: Request) {
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
            const destination = f.get('destination') === 'true';
            if (destination && !orderId) throw new Error('Selecciona el pedido de destino.');
            const row = destination && orderId ? { branch_id: await destinationDocumentBranch(c, u, orderId), status: undefined } : (await c.query(orderId ? 'SELECT branch_id FROM receiving_orders WHERE id=$1 AND NOT is_foreign AND voided_at IS NULL FOR UPDATE' : 'SELECT branch_id,status FROM receiving_sessions WHERE id=$1 FOR UPDATE', [orderId || sessionId])).rows[0];
            if (!row)
                throw new Error('No encontrado.');
            await assertBranchAccess(u, row.branch_id);
            if (sessionId && row.status !== 'DRAFT')
                throw new Error('La recepción está cerrada.');
            const existing = await c.query(`SELECT count(*)::int n FROM receiving_documents d WHERE (d.order_id=$1 OR d.session_id=$2) AND NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.action='RECEIVING_PACKING_RESET' AND a.new_value->>'orderId'=d.order_id::text AND (a.new_value->'documentIds') ? d.id::text)`, [orderId, sessionId]);
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
        return withTransaction(async c => {
            const row = (await c.query('SELECT d.order_id,COALESCE(o.branch_id,s.branch_id) branch_id,o.is_foreign FROM receiving_documents d LEFT JOIN receiving_orders o ON o.id=d.order_id LEFT JOIN receiving_sessions s ON s.id=d.session_id WHERE d.id=$1', [id])).rows[0];
            if (!row) return new Response('No encontrado', { status: 404 });
            if (new URL(req.url).searchParams.get('destination') === 'true') {
                if (!row.order_id) throw new Error('Sin acceso.');
                await destinationDocumentBranch(c, u, row.order_id);
            } else {
                if (row.is_foreign) throw new Error('Sin acceso.');
                await assertBranchAccess(u, row.branch_id);
            }
            const d = (await c.query('SELECT filename,mime,data FROM receiving_documents WHERE id=$1', [id])).rows[0];
            return new Response(new Uint8Array(d.data), { headers: { 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${d.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
        });
    }
    catch {
        return new Response('Sin acceso', { status: 403 });
    }
}

export const POST = auditRoute(handlePOST);
