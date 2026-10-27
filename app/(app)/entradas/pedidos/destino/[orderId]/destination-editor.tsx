'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import type { DestinationView, DestinationBox, DestinationItem } from '@/lib/inventory/receiving-destination';
import { packingSchema } from '@/lib/inventory/receiving-validation';
import CountGrid from '../../[id]/count-grid';
import PackingReview from '../../[id]/packing-review';
import ReceivingModal from '../../[id]/receiving-modal';

type Packing = z.infer<typeof packingSchema>;
type Save = (body: Record<string, unknown>) => Promise<boolean>;

export default function DestinationEditor({ data }: { data: DestinationView }) {
    const router = useRouter();
    const [working, setWorking] = useState(false);
    const [refreshing, startTransition] = useTransition();
    const requestLock = useRef(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [activeBox, setActiveBox] = useState('');
    const [visited, setVisited] = useState<string[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [packing, setPacking] = useState<Packing | null>(null);
    const [excluded, setExcluded] = useState(0);
    const [addBox, setAddBox] = useState<string | null>(null);
    const busy = working || refreshing;
    const { order, boxes, items } = data;
    const pending = boxes.filter(b => b.session_id && !b.received_at);
    const arrived = boxes.filter(b => b.received_at);
    const shown = arrived.some(b => b.id === activeBox) ? activeBox : arrived[0]?.id;
    async function run(task: () => Promise<void>) {
        if (requestLock.current || refreshing) return false;
        requestLock.current = true;
        setWorking(true); setError(''); setNotice('');
        try { await task(); return true; }
        catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); return false; }
        finally { requestLock.current = false; setWorking(false); }
    }
    const save: Save = body => run(async () => {
        const r = await fetch('/api/receiving/destination', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, orderId: order.id }) });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'No se pudo guardar.');
        setNotice('Guardado.'); startTransition(() => router.refresh());
    });
    async function interpret() {
        if (!file) return;
        await run(async () => {
            const form = new FormData(); form.set('file', file);
            const r = await fetch('/api/receiving/interpret', { method: 'POST', body: form });
            const result = await r.json();
            if (!r.ok) throw new Error(result.error);
            const parsed = packingSchema.parse(result);
            // Keep the original full-order file, but import only confirmed, empty boxes.
            const eligible = parsed.boxes.filter(box => {
                const match = box.number.match(/^(\d+)\s*\/\s*(\d+)$/);
                const number = match ? String(Number(match[1])) : box.number;
                if (match && Number(match[2]) !== order.total) throw new Error('El total del packing list no coincide con el pedido.');
                const b = arrived.find(b => b.carton_number === box.number || b.carton_number === number);
                return b && !b.counted_at && !items.some(l => l.carton_id === b.id);
            });
            if (!eligible.length) throw new Error('No hay cajas confirmadas y vacías de este pedido en la lectura. Revisa los números.');
            setExcluded(parsed.boxes.length - eligible.length);
            setPacking({ ...parsed, boxes: eligible });
        });
    }
    return <>
        <header className="receivingHomeHero"><span className="receivingEyebrow">{order.destination}</span><h1>{order.product}</h1><p>{order.marking} · {order.shipping} · {order.total} cajas{order.supplier ? ` · ${order.supplier}` : ''}</p><small>{order.reference} · Origen: {order.origin}</small></header>
        {error && <p className="receivingError" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        <section className="card pad"><h2>Llegada a {order.destination}</h2><p>{arrived.length} de {order.total} cajas recibidas aquí · {order.counted} contadas</p>
            {pending.length > 0 && <><p>Estas cajas están registradas en origen. Selecciona únicamente las que ya tienes físicamente.</p>
                {data.review ? <><button type="button" className="receivingSecondary" disabled={busy} onClick={() => setSelected(pending.map(b => b.id))}>Seleccionar todas las pendientes</button>
                    <div className="destinationArrivalSquares">{pending.map(b => <label key={b.id} className="destinationArrivalSquare"><input type="checkbox" disabled={busy} checked={selected.includes(b.id)} onChange={e => setSelected(v => e.target.checked ? [...v, b.id] : v.filter(id => id !== b.id))}/><b>{b.carton_number}</b></label>)}</div>
                    <button className="receivingSave" disabled={busy || !selected.length} onClick={async () => {
                        if (!confirm(`¿Confirmas que estas ${selected.length} cajas ya llegaron físicamente a ${order.destination}?`)) return;
                        if (await save({ action: 'confirmArrival', boxIds: selected })) setSelected([]);
                    }}>Confirmar {selected.length || ''} cajas recibidas</button>
                </> : <p>Un encargado debe confirmar la llegada para habilitar el conteo.</p>}</>}
            {order.total > order.physical && <p className="receivingMuted">{order.total - order.physical} cajas todavía no llegan al origen.</p>}
        </section>
        {data.review && arrived.length > 0 && <section className="card pad"><details><summary>Packing list y archivos</summary><p>Solo se habilitan las cajas confirmadas aquí. Los archivos siempre pertenecen a este pedido.</p>
            <label className="receivingField">Seleccionar packing list o comprobante<input type="file" disabled={busy} accept=".xlsx,.xls,.csv,.pdf,image/*" onChange={e => { setFile(e.target.files?.[0] ?? null); setPacking(null); }}/></label>
            <div className="actions"><button className="receivingSecondary" disabled={busy || !file} onClick={interpret}>Leer packing list con IA</button>
                <button className="receivingSecondary" disabled={busy || !file} onClick={() => run(async () => {
                    const form = new FormData(); form.set('file', file!); form.set('orderId', order.id); form.set('destination', 'true');
                    const r = await fetch('/api/receiving/documents', { method: 'POST', body: form }); const result = await r.json();
                    if (!r.ok) throw new Error(result.error); setNotice('Archivo adjuntado al pedido.'); startTransition(() => router.refresh());
                })}>Adjuntar archivo original</button></div>
            {data.documents.map(d => <p key={d.id}><a href={`/api/receiving/documents?id=${d.id}&destination=true`}>{d.filename}</a></p>)}
            {packing && <><p>Referencia leída: <b>{packing.reference || 'No identificada'}</b>. Verifica que corresponda a <b>{order.reference}</b>.</p>
                {excluded > 0 && <p role="status">Se excluyeron {excluded} cajas: aún no recibidas aquí o con contenido ya cargado. No se modificarán.</p>}
                {packing.warnings.map((w, i) => <p key={i} className="receivingMuted">{w}</p>)}
                <PackingReview packing={packing} busy={busy} onChange={setPacking}/>
                <button className="receivingSave" disabled={busy} onClick={async () => {
                    if (!confirm('¿Revisaste los modelos, colores y números de caja de este pedido?')) return;
                    if (await save({ action: 'packing', packing: { ...packing, reference: order.reference } })) setPacking(null);
                }}>Confirmar packing list de este pedido</button></>}
        </details></section>}
        {arrived.length > 0 && <section className="card pad"><h2>Conteo en {order.destination}</h2><p>Selecciona una caja. Vacío es sin contar; 0 significa que no llegó ninguna pieza.</p>
            <div className="receivingCartonSquares">{arrived.map(b => <button key={b.id} type="button" disabled={busy} className="receivingBoxButton" aria-pressed={shown === b.id} aria-label={`Caja ${b.carton_number}${b.counted_at ? ', terminada' : ''}`} onClick={() => { setVisited(v => [...new Set([...v, shown ?? '', b.id])]); setActiveBox(b.id); }}>{b.carton_number}{b.counted_at ? ' ✓' : ''}</button>)}</div>
            {arrived.filter(b => b.id === shown || visited.includes(b.id)).map(b => <div key={b.id} hidden={shown !== b.id}><DestinationCount key={`${b.id}:${b.counted_at ?? 'draft'}`} box={b} items={items.filter(l => l.carton_id === b.id)} busy={busy} review={data.review} canRecount={data.canRecount} save={save} onAdd={() => setAddBox(b.id)}/></div>)}
        </section>}
        {addBox && <ReceivingModal title="Añadir modelo / color" busy={busy} onClose={() => setAddBox(null)}><form className="receivingCompactForm" onSubmit={async e => {
            e.preventDefault(); const f = new FormData(e.currentTarget);
            if (await save({ action: 'addItem', boxId: addBox, model: f.get('model'), color: f.get('color') })) setAddBox(null);
        }}><label className="receivingField">Modelo<input name="model" maxLength={160} disabled={busy}/></label><label className="receivingField">Color (opcional)<input name="color" maxLength={160} disabled={busy}/></label><button className="receivingSave" disabled={busy}>Añadir al conteo</button></form>{error && <p role="alert" className="receivingError">{error}</p>}</ReceivingModal>}
    </>;
}

function DestinationCount({ box, items, busy, review, canRecount, save, onAdd }: { box: DestinationBox; items: DestinationItem[]; busy: boolean; review: boolean; canRecount: boolean; save: Save; onAdd: () => void }) {
    const formRef = useRef<HTMLFormElement>(null);
    async function submit(finish: boolean) {
        const form = formRef.current;
        if (!form || (finish && !form.reportValidity())) return;
        const fields = new FormData(form);
        const lines = items.map(l => ({ id: l.id, quantity: fields.get(l.id) === '' ? null : Number(fields.get(l.id)) }));
        await save({ action: finish ? 'count' : 'saveCount', boxId: box.id, lines, notes: fields.get('notes') });
    }
    return <form ref={formRef} className="receivingCompactForm" onSubmit={e => { e.preventDefault(); void submit(true); }}><h3>Caja {box.carton_number}{box.counted_at ? ' · Conteo terminado ✓' : ''}</h3>
        <CountGrid items={items} disabled={busy || Boolean(box.counted_at)} showReference={review && Boolean(box.counted_at)} onAdd={box.counted_at ? undefined : onAdd}/>
        {!items.length && <p>Agrega un packing list o utiliza “Añadir modelo” para empezar.</p>}
        <label className="receivingField">Observaciones<textarea name="notes" maxLength={2000} defaultValue={box.notes} disabled={busy || Boolean(box.counted_at)}/></label>
        {!box.counted_at ? <div className="actions"><button type="button" disabled={busy || !items.length} onClick={() => submit(false)}>Guardar avance</button><button className="receivingSave" disabled={busy || !items.length}>Terminar conteo de esta caja</button></div> : canRecount && <button type="button" disabled={busy} onClick={() => { if (confirm('¿Autorizar reconteo? Se guardarán las cantidades anteriores en auditoría y se reiniciará esta caja.')) void save({ action: 'reopenBox', boxId: box.id }); }}>Autorizar reconteo</button>}
    </form>;
}
