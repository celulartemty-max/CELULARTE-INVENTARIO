'use client';

import { useRef, useState } from 'react';
import ReceivingModal from './receiving-modal';

type Preview = { revision: string; boxes: string[]; lines: number; documents: string[]; blocked: string };
export default function PackingReset({ orderId, sessionId, destination = false, busy = false, onDone }: {
    orderId: string; sessionId?: string; destination?: boolean; busy?: boolean; onDone: () => void;
}) {
    const [open,setOpen] = useState(false), [working,setWorking] = useState(false), [error,setError] = useState('');
    const [preview,setPreview] = useState<Preview | null>(null);
    const lock = useRef(false);
    async function request(body: Record<string,unknown>) {
        const r = await fetch(destination ? '/api/receiving/destination' : '/api/receiving', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...body,orderId,sessionId})
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'No se pudo reemplazar el packing list.');
        return result;
    }
    async function inspect() {
        if (lock.current || busy) return;
        lock.current=true; setOpen(true); setWorking(true); setError(''); setPreview(null);
        try { setPreview(await request({action:'packingResetPreview'})); }
        catch(e) { setError(e instanceof Error ? e.message : 'No se pudo revisar el pedido.'); }
        finally { lock.current=false; setWorking(false); }
    }
    return <>
        <button type="button" className="receivingSecondary" disabled={busy||working} onClick={inspect}>Reemplazar packing list</button>
        {open && <ReceivingModal title="Reemplazar packing list" busy={working||busy} onClose={()=>setOpen(false)}>
            {working && !preview && <p role="status">Revisando el pedido…</p>}
            {error && <p className="receivingError" role="alert">{error}</p>}
            {preview && (preview.blocked ? <p role="alert">{preview.blocked}</p> : <form className="receivingCompactForm" onSubmit={async e=>{
                e.preventDefault(); if(lock.current||busy)return;
                const f=new FormData(e.currentTarget);
                lock.current=true;setWorking(true);setError('');
                try { await request({action:'resetPacking',revision:preview.revision,reason:f.get('reason')});setOpen(false);onDone(); }
                catch(e){setError(e instanceof Error?e.message:'No se pudo reemplazar.');}
                finally{lock.current=false;setWorking(false);}
            }}>
                <p>Se retirarán <b>{preview.lines} renglones de modelos y colores</b> de este pedido para cargar el packing correcto.</p>
                <p>Se conservan sus <b>{preview.boxes.length} cajas</b>, números, llegadas y datos de la recepción. Los demás pedidos no cambian.</p>
                <details><summary>Ver qué se va a retirar</summary><p>Cajas del pedido: {preview.boxes.join(', ')}</p><p>{preview.documents.length} archivos pasarán al historial; seguirán disponibles para descargar.</p>{preview.documents.map((name,i)=><p key={i}>{name}</p>)}<p>También se retiran los modelos añadidos manualmente. No se permite continuar si existen cantidades contadas.</p></details>
                <label className="receivingField">Motivo<textarea name="reason" required minLength={5} maxLength={1000} disabled={working||busy} placeholder="Ej. Se cargó el packing list de otro pedido"/></label>
                <p className="receivingMuted">Los cambios sin guardar en esta pantalla se descartarán. Si ya capturaste un conteo, cancela y guarda su avance antes de continuar.</p>
                <label><input type="checkbox" required disabled={working||busy}/> Revisé el pedido y quiero retirar este contenido.</label>
                <button className="receivingSave" disabled={working||busy||(!preview.lines&&!preview.documents.length)}>{working?'Retirando…':'Retirar contenido y cargar otro'}</button>
            </form>)}
            <button type="button" className="receivingSecondary" disabled={working||busy} onClick={()=>setOpen(false)}>Cancelar</button>
        </ReceivingModal>}
    </>;
}
