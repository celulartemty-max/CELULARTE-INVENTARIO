'use client';

type Box = { id: string; order_id: string; counted_at: string | null };
type Props = {
    sessionId: string; status: string; total: number; boxes: Box[]; foreignTotal: number; busy: boolean;
    onClose: () => void; onPos: () => void; onReview: (orderId: string) => void;
};

export default function ReceivingClose({ sessionId, status, total, boxes, foreignTotal, busy, onClose, onPos, onReview }: Props) {
    const identified = boxes.length + foreignTotal;
    const pending = boxes.filter(box => !box.counted_at);
    const counted = boxes.length - pending.length;
    const draft = status === 'DRAFT';
    const ready = identified === total && !pending.length;
    const state = draft ? ready ? 'Listo para finalizar' : 'Hay pendientes' : status === 'CLOSED' ? 'Recepción finalizada' : status === 'ARCHIVED' ? 'Recepción archivada' : status === 'POS_REGISTERED' ? 'Registrada en sistema' : 'Estado no disponible';
    return <section className="card pad receivingClose" aria-label="Resumen y cierre">
        <div className="receivingCloseHeading"><h2>Resumen y cierre</h2><span className="receivingCloseStatus" data-ready={draft ? ready : ['CLOSED', 'ARCHIVED', 'POS_REGISTERED'].includes(status)}>{state}</span></div>
        <div className="receivingCloseStats"><div><span>Cajas identificadas</span><strong>{identified}<small> / {total}</small></strong></div><div><span>Conteo de esta sucursal</span><strong>{counted}<small> / {boxes.length}</small></strong></div></div>
        {foreignTotal > 0 && <p className="receivingCloseNote">{foreignTotal} {foreignTotal === 1 ? 'caja de otra sucursal: no requiere' : 'cajas de otras sucursales: no requieren'} conteo aquí.</p>}
        {draft && !ready && <div className="receivingClosePending" role="status"><b>Antes de finalizar</b>
            {identified < total && <p>Falta identificar {total - identified} {total - identified === 1 ? 'caja' : 'cajas'} de esta recepción.</p>}
            {identified > total && <p>Hay {identified - total} {identified - total === 1 ? 'caja de más' : 'cajas de más'}. Revisa el total de la recepción.</p>}
            {pending.length > 0 && <p>{pending.length} {pending.length === 1 ? 'caja de esta sucursal está pendiente' : 'cajas de esta sucursal están pendientes'} de conteo. <button type="button" disabled={busy} onClick={() => { if (!busy) onReview(pending[0].order_id); }}>Revisar pendientes →</button></p>}
        </div>}
        {draft && ready && <p className="receivingCloseNote">{boxes.length ? 'Todo listo. Puedes finalizar la recepción.' : 'Solo llegaron cajas de otras sucursales. Se archivará su llegada.'}</p>}
        {!draft && <p className="receivingCloseNote">{status === 'CLOSED' ? 'El conteo está cerrado. Falta confirmar el registro en tu sistema.' : status === 'ARCHIVED' ? 'Solo cajas de otras sucursales. No requiere registro de inventario aquí.' : status === 'POS_REGISTERED' ? 'Registro confirmado. Puedes descargar el Excel cuando lo necesites.' : 'Actualiza la página antes de continuar.'}</p>}
        <div className="receivingCloseActions"><a className="receivingCloseExport" href={`/api/receiving/export?id=${sessionId}`}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>Descargar Excel</a>
            {draft ? <button type="button" className="receivingCloseFinish" disabled={busy || !ready} onClick={() => { if (!busy && ready) onClose(); }}>{busy ? 'Guardando…' : '✓ Finalizar recepción'}</button> : status === 'CLOSED' && <button type="button" className="receivingCloseFinish" disabled={busy} onClick={() => { if (!busy) onPos(); }}>{busy ? 'Guardando…' : 'Confirmar registro en sistema'}</button>}
        </div>
        <small className="receivingCloseFootnote">Descargar el Excel no cierra ni modifica la recepción.</small>
    </section>;
}
