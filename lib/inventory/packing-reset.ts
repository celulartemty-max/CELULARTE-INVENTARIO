import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { withTransaction } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/types';

type Client = Parameters<Parameters<typeof withTransaction>[0]>[0];

// The caller must lock and authorize the order before entering this function.
// Carton locks also serialize this operation with source count/add-item actions.
export async function resetPacking(c: Client, u: SessionUser, orderId: string, branchId: string, body: Record<string, unknown>) {
    const boxes = (await c.query(`SELECT b.id,b.carton_number,b.counted_at,b.session_id,s.status session_status
        FROM receiving_cartons b LEFT JOIN receiving_sessions s ON s.id=b.session_id
        WHERE b.order_id=$1 ORDER BY b.id FOR UPDATE OF b`, [orderId])).rows;
    const items = (await c.query(`SELECT l.id,l.carton_id,l.model,l.color,l.expected,l.counted FROM receiving_items l
        JOIN receiving_cartons b ON b.id=l.carton_id WHERE b.order_id=$1 ORDER BY l.id FOR UPDATE OF l`, [orderId])).rows;
    const documents = (await c.query(`SELECT d.id,d.filename FROM receiving_documents d WHERE d.order_id=$1 AND NOT EXISTS (
        SELECT 1 FROM audit_events a WHERE a.action='RECEIVING_PACKING_RESET' AND a.new_value->>'orderId'=d.order_id::text
        AND (a.new_value->'documentIds') ? d.id::text) ORDER BY d.id FOR UPDATE OF d`, [orderId])).rows;
    const registered = (await c.query(`SELECT 1 FROM receiving_destination_registrations r
        JOIN receiving_cartons b ON b.id=r.carton_id WHERE b.order_id=$1 LIMIT 1`, [orderId])).rowCount;
    const sourceClosed = body.destination !== true && boxes.some(b => b.session_id && b.session_status !== 'DRAFT');
    const blocked = registered || sourceClosed ? 'Este pedido ya tiene una recepción cerrada o un registro en sistema. Requiere una corrección supervisada; no se puede reiniciar.'
        : boxes.some(b => b.counted_at) || items.some(l => l.counted !== null)
            ? 'Este pedido ya tiene cantidades contadas, incluso avances guardados. No se borrarán. Solicita una corrección supervisada.' : '';
    const revision = createHash('sha256').update(JSON.stringify({ boxes, items, documents, registered, sourceClosed })).digest('hex');
    const preview = { revision, boxes: boxes.map(b => b.carton_number).sort((a,b) => a.localeCompare(b,'es',{numeric:true})), lines: items.length, documents: documents.map(d => d.filename), blocked };
    if (body.action === 'packingResetPreview') return preview;
    if (blocked) throw new Error(blocked);
    if (z.string().parse(body.revision) !== revision) throw new Error('El pedido cambió mientras lo revisabas. Cierra y vuelve a abrir el reemplazo.');
    const reason = z.string().trim().min(5,'Indica el motivo del reemplazo (mínimo 5 caracteres).').max(1000).parse(body.reason);
    if (!items.length && !documents.length) throw new Error('No hay contenido ni archivos vigentes que reemplazar.');
    // Keep originals downloadable. This event marks their IDs as historical;
    // the complete previous item snapshot is retained before removing live rows.
    await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_PACKING_RESET',$3::jsonb)`,
        [u.id,branchId,JSON.stringify({ orderId, reason, destination: body.destination === true, documentIds: documents.map(d => d.id), documents, previous: items, boxes: preview.boxes })]);
    await c.query('DELETE FROM receiving_items WHERE carton_id IN (SELECT id FROM receiving_cartons WHERE order_id=$1)',[orderId]);
    return { ok: true };
}
