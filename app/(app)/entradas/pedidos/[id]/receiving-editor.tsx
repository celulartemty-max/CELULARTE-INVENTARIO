'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import { packingSchema } from '@/lib/inventory/receiving-validation';
import ForeignCartons, { type ForeignCarton } from './foreign-cartons';
import BatchIntake, {type Batch, type PendingCarton} from './batch-intake';
import PackingReview from './packing-review';
import CountGrid from './count-grid';
type Packing = z.infer<typeof packingSchema>;
type Box = {
    id: string;
    order_id: string;
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
        carrier: string;
        tracking: string;
    };
    boxes: Box[];
    foreign: ForeignCarton[];
    items: Item[];
    pending: PendingCarton[];
    batches: Batch[];
    foreignBoxes: PendingCarton[];
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
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [packing, setPacking] = useState<Packing | null>(null), [raw, setRaw] = useState(''), [file, setFile] = useState<File | null>(null), [packingOrder, setPackingOrder] = useState(''), [active, setActive] = useState<string | null>(null);
    const s = data.session, draft = s.status === 'DRAFT';
    const [detailTab, setDetailTab] = useState<'packing'|'count'>('packing');
    const [reviewVersion, setReviewVersion] = useState(0);
    const foreignTotal = data.foreignBoxes.length + data.foreign.reduce((n, r) => n + r.carton_count, 0);

    const targetOrder = data.orders.find(o=>o.id===packingOrder);
    const currentBatch=data.batches.find(b=>b.id===packingOrder);
    const currentBoxes=data.boxes.filter(b=>b.order_id===packingOrder).sort((a,b)=>a.carton_number.localeCompare(b.carton_number,'es',{numeric:true})),currentForeign=data.foreignBoxes.filter(b=>b.order_id===packingOrder);
    const foreignOrder=!!currentBatch?.is_foreign||currentForeign.length>0;
    function openOrder(id:string){setPackingOrder(id);setPacking(null);setRaw('');setFile(null);setActive(null);setError('');const ownIds=new Set(data.boxes.filter(b=>b.order_id===id).map(b=>b.id));setDetailTab(data.items.some(i=>ownIds.has(i.carton_id))?'count':'packing');window.scrollTo({top:0,behavior:'smooth'})}
    function back(){if((active||packing)&&!confirm('¿Volver a los pedidos? Guarda tu avance antes de salir.'))return;setPackingOrder('');setActive(null);setPacking(null);setRaw('');setFile(null);setError('')}
    async function saveBatch(value:Record<string,unknown>) {setBusy(true);setError('');try{await act(value);router.refresh();return true}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar');return false}finally{setBusy(false)}}
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
    function manual() { const p: Packing = { reference: targetOrder?.reference ?? '', warnings: [], boxes: [{ number: '1', items: [{ model: '', color: '', expected: null }] }] }; setReviewVersion(v => v + 1); setPacking(p); setRaw(JSON.stringify(p, null, 2)); setFile(null); }
    function editPacking(p: Packing) { setPacking(p); setRaw(JSON.stringify(p, null, 2)); }
    return <main className="receivingOrders"><header>{packingOrder?<><button className="receivingSecondary" disabled={busy} onClick={back}>← Todos los pedidos</button><h1>{currentBatch?.product||currentBoxes[0]?.product||currentForeign[0]?.product||'Pedido'}</h1><p>{currentBatch?.shipping||currentBoxes[0]?.shipping||currentForeign[0]?.shipping} · {currentBatch?.marking||currentBoxes[0]?.marking||currentForeign[0]?.marking} · {currentBatch?.received_here??currentBoxes.length+currentForeign.length} cajas en esta recepción{currentBatch&&' · '+currentBatch.remaining+' pendientes de llegar'}</p></>:<><Link href="/entradas/pedidos">← Recepciones</Link><h1>{s.reference}</h1><p>{s.total_boxes} cajas recibidas · <b>{data.boxes.length+foreignTotal} identificadas</b> · Faltan {Math.max(0,s.total_boxes-data.boxes.length-foreignTotal)}</p><progress aria-label="Cajas identificadas" value={data.boxes.length+foreignTotal} max={s.total_boxes}/></>}</header>
 {error && <div className="card pad" role="alert" style={{ color: '#b42318' }}>{error}</div>}
 {!packingOrder&&<>
 {data.review && <section className="card pad receivingFreight"><div className="receivingFreightTop"><div><h2>Flete y comprobante</h2><p>{s.arrival_date} · {s.carrier||'Sin transportista'} · Guía: {s.tracking||'—'}</p></div><div className="receivingFreightAmount"><small>Monto del flete</small><strong>{data.cost?.cost != null ? new Intl.NumberFormat('es-MX',{style:'currency',currency:data.cost.currency}).format(Number(data.cost.cost)) : 'Sin monto'}</strong><span>{data.cost?.currency||'MXN'}</span></div></div>
 {draft&&<div className="receivingFreightUploads">{([{title:'Abrir cámara',camera:true},{title:'Seleccionar archivo',camera:false}]).map(option=><label className="receivingUploadChoice" key={option.title}><span>{option.camera?'📷':'📎'} {option.title}</span><input aria-label={option.title} type="file" accept={option.camera?'image/*':'.pdf,.png,.jpg,.jpeg'} capture={option.camera?'environment':undefined} disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)run(()=>upload(f,{sessionId:s.id}));e.target.value=''}}/></label>)}<small>{busy?'Subiendo comprobante…':'Foto o PDF · hasta 2 MB'}</small></div>}
 {data.cost?.notes&&<p>{data.cost.notes}</p>}{data.documents.filter(d=>!d.order_id).map(d=><a className="receivingFreightFile" key={d.id} href={`/api/receiving/documents?id=${d.id}`}>📄 {d.filename} · Ver comprobante</a>)}</section>}
 {data.review?<BatchIntake batches={data.batches} pending={data.pending} products={products} busy={busy} draft={draft} save={saveBatch} onOpen={openOrder} error={error}/>:<section className="card pad"><h2>Pedidos</h2>{Array.from(new Map(data.boxes.map(b=>[b.order_id,b])).values()).map(b=><p key={b.order_id}><button onClick={()=>openOrder(b.order_id)}>{b.product} · {b.marking} · Abrir pedido</button></p>)}</section>}
 {data.foreign.length>0&&<details className="card pad"><summary>Registros ajenos anteriores</summary><ForeignCartons rows={data.foreign} editable={data.review&&draft} busy={busy} save={saveBatch} voidRecord={id=>run(async()=>{await act({action:'voidForeign',recordId:id})})}/></details>}
 </>}
 {packingOrder&&<>{foreignOrder?<section className="card pad"><h2>Cajas ajenas · solo registro</h2><p>No requieren packing list ni conteo.</p><p>Números recibidos: {currentForeign.map(b=>b.carton_number).join(', ')||'—'}</p></section>:<>
 {data.review&&<div className="receivingTabs" aria-label="Trabajo del pedido"><button aria-pressed={detailTab==='packing'} onClick={()=>setDetailTab('packing')}>Packing list</button><button aria-pressed={detailTab==='count'} onClick={()=>setDetailTab('count')}>Contar piezas</button></div>}
 <div hidden={data.review&&detailTab!=='packing'}>
 {data.review && draft && <>
 <section className="card pad"><h2>Packing list</h2><p>Sube el archivo de este pedido o captura su contenido.</p>
 <label>Excel o imagen (hasta 2 MB)<input type="file" accept=".xlsx,.png,.jpg,.jpeg" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setPacking(null); }}/></label>
 <div className="actions"><button disabled={busy || !file || !targetOrder} onClick={() => run(async () => { const f = new FormData(); f.set('file', file!); const r = await fetch('/api/receiving/interpret', { method: 'POST', body: f }); const j = await r.json(); if (!r.ok)
            throw new Error(j.error); setReviewVersion(v => v + 1); setPacking(j); setRaw(JSON.stringify(j, null, 2)); })}>{busy ? 'Procesando…' : 'Leer packing list con IA'}</button><button disabled={busy || !targetOrder} onClick={manual}>Capturar sin archivo</button></div>
 {packing && <form className="formGrid receivingPackingForm" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); run(async () => { const p = packingSchema.parse(JSON.parse(raw)); if(!targetOrder)throw new Error('Selecciona el pedido.'); p.reference = targetOrder.reference; const j = await act({ action: 'packing', orderId: targetOrder.id, packing: p, documentReference: String(form.get('reference')||'') }); setPacking(null); setRaw(''); if (file) {
                try {
                    await upload(file, { orderId: j.orderId });
                }
                catch {
                    throw new Error('Contenido guardado en el pedido, pero el archivo no se adjuntó. Puedes volver a adjuntarlo en la sección de documentos del pedido.');
                }
            } setFile(null); }); }}>
 <h3>Revisar y confirmar</h3>{packing.warnings.length > 0 && <details className="packingWarnings"><summary>{packing.warnings.length} avisos de la lectura · revisar antes de confirmar</summary>{packing.warnings.map((w, i) => <p key={i}>{w.replace(/expected\s*:\s*null/gi, 'cantidad de referencia vacía')}</p>)}</details>}
 <label>Referencia leída en el documento (verifica que sea el pedido correcto)<input name="reference" defaultValue={packing.reference} maxLength={160}/></label>
 <PackingReview key={reviewVersion} packing={packing} busy={busy} onChange={editPacking}/>
 <details><summary>Corregir lectura o captura manual</summary><p>Edita las cajas y líneas. expected puede ser null si no hay cantidad de referencia. Si no se entiende el archivo, no confirmes: revisémoslo juntos.</p><textarea aria-label="Detalle del packing list" rows={14} style={{ fontFamily: 'monospace', width: '100%' }} value={raw} onChange={e => setRaw(e.target.value)}/><button type="button" onClick={() => { try {
                setPacking(packingSchema.parse(JSON.parse(raw)));
                setReviewVersion(v => v + 1);
                setError('');
            }
            catch {
                setError('Revisa la estructura del detalle. No se ha importado nada.');
            } }}>Actualizar vista previa</button></details>
 <label><input type="checkbox" required/> Confirmo que el contenido corresponde al pedido seleccionado y a sus números de caja. Las cantidades contadas seguirán vacías.</label><button disabled={busy}>Confirmar contenido para este pedido</button>
 </form>}
 </section>
 </>}
 {data.review&&<section className="card pad"><h2>Archivos del pedido</h2>{data.documents.filter(d=>d.order_id===packingOrder).map(d=><p key={d.id}><a href={`/api/receiving/documents?id=${d.id}`}>{d.filename}</a></p>)}{draft&&<form className="receivingCompactForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget).get('document');if(f instanceof File)run(()=>upload(f,{orderId:packingOrder}))}}><label className="receivingField">Adjuntar original (Excel, PDF o imagen)<input name="document" type="file" required accept=".xlsx,.pdf,.png,.jpg,.jpeg" disabled={busy}/></label><button disabled={busy}>Adjuntar archivo</button></form>}</section>}
 </div>
 <div hidden={data.review&&detailTab!=='count'}>
 <section className="card pad"><h2>Conteo</h2><p>Cuenta físicamente. Vacío significa sin contar; 0 significa que no llegó ninguna pieza.</p><div className="receivingCartonSquares" aria-label="Seleccionar caja">{currentBoxes.map(b=><button key={b.id} className="receivingBoxButton" aria-label={`Caja ${b.carton_number}, ${b.counted_at?'contada':'pendiente de conteo'}`} aria-pressed={active===b.id} data-counted={!!b.counted_at} onClick={()=>{if(active!==b.id&&active&&!confirm('¿Cambiar de caja? Guarda tu avance antes de salir.'))return;setActive(b.id)}}><b>{b.carton_number}</b><span>{b.counted_at?'✓':'·'}</span></button>)}</div><p className="receivingMuted">Selecciona un número para contar esa caja. ✓ = conteo terminado.</p>{currentBoxes.filter(b=>b.id===active).map(b => <article key={b.id} className="card pad"><h3>Caja {b.carton_number}</h3><p>{b.product} · {b.shipping} · {b.marking} · {b.counted_at?'Contada':'Pendiente de conteo'}</p>{active === b.id && <form className="formGrid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const items = data.items.filter(l => l.carton_id === b.id); const saving = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft'; if (!saving && items.some(l => f.get(l.id) === '')) {
                setError('Captura todas las cantidades; usa 0 donde no haya piezas.');
                return;
            } if (!saving && !confirm('¿Terminar el conteo de esta caja? Ya no podrás editarlo.'))
                return; run(async () => { await act({ action: saving ? 'saveCount' : 'count', boxId: b.id, lines: items.map(l => ({ id: l.id, quantity: f.get(l.id) === '' ? null : Number(f.get(l.id)) })), notes: f.get('notes') }); if (!saving)
                setActive(null); }); }}>
 {!data.items.some(l=>l.carton_id===b.id)&&<p>Esta caja aún no tiene contenido registrado. Agrega el packing list arriba o captura sus modelos/colores abajo; las cantidades empiezan vacías.</p>}
 <CountGrid items={data.items.filter(l=>l.carton_id===b.id)} disabled={!!b.counted_at||busy||!draft} showReference={data.review&&!!b.counted_at}/>
 <label>Observaciones<textarea name="notes" maxLength={2000} defaultValue={b.notes} disabled={!!b.counted_at || !draft || busy}/></label>{!b.counted_at && draft && <div className="actions"><button disabled={busy || !data.items.some(l=>l.carton_id===b.id)} value="draft" formNoValidate>Guardar avance</button><button disabled={busy || !data.items.some(l=>l.carton_id===b.id)}>Terminar conteo de esta caja</button></div>}
 </form>}
 {active === b.id && !b.counted_at && draft && <details><summary>Encontré un modelo/color que no aparece</summary><form className="formGrid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => { await act({ action: 'addItem', boxId: b.id, model: f.get('model'), color: f.get('color') }); }); }}><label>Modelo<input name="model" maxLength={160}/></label><label>Color<input name="color" maxLength={160}/></label><button disabled={busy}>Agregar línea al conteo</button></form></details>}
 {active === b.id && b.counted_at && draft && data.canRecount && <button disabled={busy} onClick={() => { if (confirm('¿Autorizar reconteo? Las cantidades quedarán vacías y se conservará el conteo anterior en auditoría.'))
            run(async () => { await act({ action: 'reopenBox', boxId: b.id }); setActive(null); }); }}>Autorizar reconteo</button>}
 {active === b.id && draft && data.review && <form className="formGrid" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); run(async () => { await act({ action: 'markBox', boxId: b.id, marking: f.get('marking') }); }); }}><label>Marca de esta caja<input name="marking" required maxLength={160} defaultValue={b.marking}/></label><button disabled={busy}>Guardar marca de esta caja</button></form>}
 </article>)}</section>
 </div>
 </>}
 </>}
 {!packingOrder&&data.review && <details className="card pad"><summary>Cerrar recepción / Descargar Excel</summary><h2>Cierre de recepción</h2><p><a href={`/api/receiving/export?id=${s.id}`}>Descargar detalle por caja en Excel</a></p><p>El total físico incluye cajas propias y ajenas. Solo las propias requieren conteo y registro en sistema.</p>{draft ? <button disabled={busy} onClick={() => { if (confirm('¿Cerrar esta recepción? Debe estar registrado el total físico y terminado el conteo de las cajas de esta sucursal. Las ajenas quedan solo archivadas.'))
        run(async () => { await act({ action: 'close' }); }); }}>Terminar recepción</button> : s.status === 'CLOSED' ? <button disabled={busy} onClick={() => { if (confirm('¿Confirmas que registraste esta recepción en el sistema?'))
        run(async () => { await act({ action: 'pos' }); }); }}>Registrado en sistema</button> : <p>{s.status === 'ARCHIVED' ? '✓ Archivada. Solo cajas ajenas: no requiere registro de inventario.' : '✓ Registrada en sistema.'}</p>}</details>}
 </main>;
}
