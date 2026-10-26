'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import { packingSchema } from '@/lib/inventory/receiving-validation';
type Packing = z.infer<typeof packingSchema>;
type Box = {
    id: string;
    carton_number: string;
    reference: string;
    shipping: string;
    marking: string;
    product: string;
    counted_at: string | null;
    notes: string;
};
type Item = {
    id: string;
    carton_id: string;
    model: string;
    color: string;
    counted: number | null;
    expected?: number | null;
};
type Data = {
    review: boolean;
    canRecount: boolean;
    orders: {
        id: string;
        reference: string;
    }[];
    session: {
        id: string;
        reference: string;
        arrival_date: string;
        status: string;
        total_boxes: number;
    };
    boxes: Box[];
    items: Item[];
    pending: Box[];
    documents: {
        id: string;
        filename: string;
        order_id: string | null;
    }[];
    cost: {
        cost: string | null;
        currency: string;
        notes: string;
    } | null;
};
export default function ReceivingEditor({ data, products }: {
    data: Data;
    products: {
        id: string;
        name: string;
    }[];
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [packing, setPacking] = useState<Packing | null>(null), [raw, setRaw] = useState(''), [file, setFile] = useState<File | null>(null), [selected, setSelected] = useState<string[]>([]), [active, setActive] = useState<string | null>(null);
    const s = data.session, draft = s.status === 'DRAFT';
    async function act(body: Record<string, unknown>) { const r = await fetch('/api/receiving', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s.id, ...body }) }); const j = await r.json(); if (!r.ok)
        throw new Error(j.error); return j; }
    async function run(work: () => Promise<void>) { setBusy(true); setError(''); try {
        await work();
        router.refresh();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
    finally {
        setBusy(false);
    } }
    async function upload(f: File, owner: {
        orderId?: string;
        sessionId?: string;
    }) { const form = new FormData(); form.set('file', f); for (const [k, v] of Object.entries(owner))
        form.set(k, v); const r = await fetch('/api/receiving/documents', { method: 'POST', body: form }); const j = await r.json(); if (!r.ok)
        throw new Error(j.error); }
    function manual() { const p: Packing = { reference: '', warnings: [], boxes: [{ number: '1', items: [{ model: '', color: '', expected: null }] }] }; setPacking(p); setRaw(JSON.stringify(p, null, 2)); setFile(null); }
    function editPacking(p: Packing) { setPacking(p); setRaw(JSON.stringify(p, null, 2)); }
    return <main className="receivingOrders"><header><Link href="/entradas/pedidos">← Recepciones por pedido</Link><h1>{s.reference}</h1><p>{s.arrival_date} · {data.boxes.length}/{s.total_boxes} cajas asignadas · {data.boxes.filter(b => b.counted_at).length} contadas</p><small>{s.status === 'DRAFT' ? 'En captura' : s.status === 'CLOSED' ? 'Conteo terminado · pendiente de registrar en sistema' : 'Registrada en sistema'}</small></header>
 {error && <div className="card pad" role="alert" style={{ color: '#b42318' }}>{error}</div>}
 {data.review && <section className="card pad"><h2>Costo y comprobantes</h2><p>{data.cost?.cost !== null ? `${data.cost?.cost} ${data.cost?.currency}` : 'Sin costo registrado'}</p>{data.cost?.notes && <p>{data.cost.notes}</p>}{draft && <label>Adjuntar cobro (PDF o imagen, hasta 2 MB)<input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f)
        run(() => upload(f, { sessionId: s.id })); e.target.value = ''; }}/></label>}{data.documents.filter(d => !d.order_id).map(d => <p key={d.id}><a href={`/api/receiving/documents?id=${d.id}`}>Descargar {d.filename}</a></p>)}</section>}
 {data.review && draft && <>
 <section className="card pad"><h2>1. Preparar un pedido</h2><p>El packing list pertenece únicamente a este pedido. La IA no crea cajas hasta que confirmes.</p>
 <label>Excel o imagen (hasta 2 MB)<input type="file" accept=".xlsx,.png,.jpg,.jpeg" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPacking(null); }}/></label>
 <div className="actions"><button disabled={busy || !file} onClick={() => run(async () => { const f = new FormData(); f.set('file', file!); const r = await fetch('/api/receiving/interpret', { method: 'POST', body: f }); const j = await r.json(); if (!r.ok)
            throw new Error(j.error); setPacking(j); setRaw(JSON.stringify(j, null, 2)); })}>{busy ? 'Procesando…' : 'Leer packing list con IA'}</button><button disabled={busy} onClick={manual}>Capturar sin archivo</button></div>
 {packing && <form className="formGrid" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); run(async () => { const p = packingSchema.parse(JSON.parse(raw)); p.reference = String(form.get('reference')).trim(); const j = await act({ action: 'order', packing: p, productId: form.get('product'), shipping: form.get('shipping'), marking: form.get('marking') }); setPacking(null); setRaw(''); if (file) {
                try {
                    await upload(file, { orderId: j.orderId });
                }
                catch {
                    throw new Error('Pedido creado, pero el archivo no se adjuntó. Puedes volver a adjuntarlo en la sección de documentos del pedido.');
                }
            } setFile(null); }); }}>
 <h3>Revisar y confirmar</h3>{packing.warnings.map((w, i) => <p key={i} style={{ color: '#b54708' }}>{w}</p>)}
 <label>Pedido<input name="reference" defaultValue={packing.reference} required maxLength={160}/></label>
 <label>Producto<select name="product" required><option value="">Seleccionar…</option>{products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
 <label>Transporte<select name="shipping" required defaultValue=""><option value="" disabled>Confirma…</option><option>AIR</option><option>SEA</option></select></label>
 <label>Marca de sucursal<select name="marking" required defaultValue=""><option value="" disabled>Confirma…</option><option>JAPS</option><option>PER</option></select></label>
 <p>{packing.boxes.length} cajas detectadas. Revisa los campos antes de confirmar.</p>
 {packing.boxes.map((b, bi) => <div className="card pad" key={bi}><label>Número de caja<input required value={b.number} onChange={e => editPacking({ ...packing, boxes: packing.boxes.map((x, i) => i === bi ? { ...x, number: e.target.value } : x) })}/></label>{b.items.map((l, li) => <div className="receivingImportLine" key={li}>{(['model', 'color', 'expected'] as const).map(k => <label key={k}>{k === 'model' ? 'Modelo' : k === 'color' ? 'Color' : 'Esperado (solo revisión)'}<input aria-label={`${k} caja ${b.number} línea ${li + 1}`} type={k === 'expected' ? 'number' : 'text'} min={0} step={1} value={l[k] ?? ''} onChange={e => editPacking({ ...packing, boxes: packing.boxes.map((x, i) => i === bi ? { ...x, items: x.items.map((item, j) => j === li ? { ...item, [k]: k === 'expected' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value } : item) } : x) })}/></label>)}<button type="button" disabled={b.items.length === 1} onClick={() => editPacking({ ...packing, boxes: packing.boxes.map((x, i) => i === bi ? { ...x, items: x.items.filter((_, j) => j !== li) } : x) })}>Quitar línea</button></div>)}<div className="actions"><button type="button" onClick={() => editPacking({ ...packing, boxes: packing.boxes.map((x, i) => i === bi ? { ...x, items: [...x.items, { model: '', color: '', expected: null }] } : x) })}>+ Modelo/color</button><button type="button" disabled={packing.boxes.length === 1} onClick={() => editPacking({ ...packing, boxes: packing.boxes.filter((_, i) => i !== bi) })}>Quitar caja</button></div></div>)}
 <button type="button" onClick={() => editPacking({ ...packing, boxes: [...packing.boxes, { number: String(packing.boxes.length + 1), items: [{ model: '', color: '', expected: null }] }] })}>+ Otra caja independiente</button>
 <details><summary>Corregir lectura o captura manual</summary><p>Edita las cajas y líneas. expected puede ser null si no hay cantidad de referencia. Si no se entiende el archivo, no confirmes: revisémoslo juntos.</p><textarea aria-label="Detalle del packing list" rows={14} style={{ fontFamily: 'monospace', width: '100%' }} value={raw} onChange={e => setRaw(e.target.value)}/><button type="button" onClick={() => { try {
                setPacking(packingSchema.parse(JSON.parse(raw)));
                setError('');
            }
            catch {
                setError('Revisa la estructura del detalle. No se ha importado nada.');
            } }}>Actualizar vista previa</button></details>
 <label><input type="checkbox" required/> Confirmo pedido, cajas, contenido y características. Todavía no se marcarán como recibidas.</label><button disabled={busy}>Confirmar y crear cajas del pedido</button>
 </form>}
 </section>
 <section className="card pad"><h2>Documentos de cada pedido</h2>{data.orders.map(o => <div key={o.id}><b>{o.reference}</b>{data.documents.filter(d => d.order_id === o.id).map(d => <p key={d.id}><a href={`/api/receiving/documents?id=${d.id}`}>Descargar {d.filename}</a></p>)}</div>)}<form className="formGrid" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget), f = form.get('document'); if (f instanceof File)
            run(() => upload(f, { orderId: String(form.get('order')) })); }}><label>Pedido<select name="order" required><option value="">Selecciona…</option>{data.orders.map(o => <option key={o.id} value={o.id}>{o.reference}</option>)}</select></label><label>Packing list<input name="document" type="file" required accept=".xlsx,.pdf,.png,.jpg,.jpeg"/></label><button disabled={busy}>Adjuntar al pedido seleccionado</button></form></section>
 <section className="card pad"><h2>2. Seleccionar cajas que llegaron</h2><p>Selecciona el pedido y número exactos. Las demás siguen pendientes para otra recepción.</p>{data.pending.map(b => <label className="receivingPending" key={b.id}><input type="checkbox" disabled={busy} checked={selected.includes(b.id)} onChange={e => setSelected(v => e.target.checked ? [...v, b.id] : v.filter(x => x !== b.id))}/><span><b>{b.reference} · Caja {b.carton_number}</b><small>{b.product} · {b.shipping} · {b.marking}</small></span></label>)}{!data.pending.length && <p>No hay cajas pendientes. Crea un pedido primero.</p>}<button disabled={busy || !selected.length} onClick={() => run(async () => { await act({ action: 'arrive', boxIds: selected }); setSelected([]); })}>Registrar llegada de {selected.length} cajas</button></section>
 </>}
 <section className="card pad"><h2>3. Conteo por caja</h2><p>Cuenta físicamente. Vacío significa sin contar; 0 significa que no llegó ninguna pieza.</p>{data.boxes.map(b => <article key={b.id} className="card pad"><button className="receivingBoxButton" onClick={() => setActive(active === b.id ? null : b.id)}><b>{b.reference} · Caja {b.carton_number}</b><span>{b.product} · {b.shipping} · {b.marking} · {b.counted_at ? 'Contada' : 'Pendiente de conteo'}</span></button>{active === b.id && <form className="formGrid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const items = data.items.filter(l => l.carton_id === b.id); const saving = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft'; if (!saving && items.some(l => f.get(l.id) === '')) {
                setError('Captura todas las cantidades; usa 0 donde no haya piezas.');
                return;
            } if (!saving && !confirm('¿Terminar el conteo de esta caja? Ya no podrás editarlo.'))
                return; run(async () => { await act({ action: saving ? 'saveCount' : 'count', boxId: b.id, lines: items.map(l => ({ id: l.id, quantity: f.get(l.id) === '' ? null : Number(f.get(l.id)) })), notes: f.get('notes') }); if (!saving)
                setActive(null); }); }}>
 {data.items.filter(l => l.carton_id === b.id).map(l => <label key={l.id}>{l.model || 'Sin modelo'} · {l.color || 'Sin color'}<input name={l.id} type="number" min={0} max={1000000} step={1} inputMode="numeric" required placeholder="Cantidad contada" defaultValue={l.counted ?? ''} disabled={!!b.counted_at || busy || !draft}/>{data.review && b.counted_at && <small>{l.expected === null ? 'Sin cantidad de referencia' : `Esperado: ${l.expected} · Diferencia: ${Number(l.counted) - Number(l.expected)}`}</small>}</label>)}
 <label>Observaciones<textarea name="notes" maxLength={2000} defaultValue={b.notes} disabled={!!b.counted_at || !draft || busy}/></label>{!b.counted_at && draft && <div className="actions"><button disabled={busy} value="draft" formNoValidate>Guardar avance</button><button disabled={busy}>Terminar conteo de esta caja</button></div>}
 </form>}
 {active === b.id && !b.counted_at && draft && <details><summary>Encontré un modelo/color que no aparece</summary><form className="formGrid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => { await act({ action: 'addItem', boxId: b.id, model: f.get('model'), color: f.get('color') }); }); }}><label>Modelo<input name="model" maxLength={160}/></label><label>Color<input name="color" maxLength={160}/></label><button disabled={busy}>Agregar línea al conteo</button></form></details>}
 {active === b.id && b.counted_at && draft && data.canRecount && <button disabled={busy} onClick={() => { if (confirm('¿Autorizar reconteo? Las cantidades quedarán vacías y se conservará el conteo anterior en auditoría.'))
            run(async () => { await act({ action: 'reopenBox', boxId: b.id }); setActive(null); }); }}>Autorizar reconteo</button>}
 </article>)}</section>
 {data.review && <section className="card pad"><h2>Cierre y registro en sistema</h2><p><a href={`/api/receiving/export?id=${s.id}`}>Descargar detalle por caja en Excel</a></p>{draft ? <button disabled={busy} onClick={() => { if (confirm('¿Cerrar esta recepción? Todas las cajas que llegaron deben estar contadas.'))
        run(async () => { await act({ action: 'close' }); }); }}>Terminar recepción</button> : s.status === 'CLOSED' ? <button disabled={busy} onClick={() => { if (confirm('¿Confirmas que registraste esta recepción en el sistema?'))
        run(async () => { await act({ action: 'pos' }); }); }}>Registrado en sistema</button> : <p>✓ Registrada en sistema.</p>}</section>}
 </main>;
}
