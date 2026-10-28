'use client';
import {useRef,useState} from 'react';
import type {Transfer,TransferLine} from './transfer-editor';
import './transfer-receipt.css';

type ReceiptLine={id:string;received:number;reason?:string};
export default function TransferReceipt({transfer:t,lines,canReceive,onReceive}:{transfer:Transfer;lines:TransferLine[];canReceive:boolean;onReceive:(lines:ReceiptLine[])=>Promise<unknown>}){
    const [received,setReceived]=useState<Record<string,string>>(()=>Object.fromEntries(lines.map(l=>[l.id,String(l.receivedQuantity??l.sentQuantity)])));
    const [reasons,setReasons]=useState<Record<string,string>>(()=>Object.fromEntries(lines.map(l=>[l.id,l.differenceReason??''])));
    const [busy,setBusy]=useState(false),[error,setError]=useState('');
    const lock=useRef(false);
    const valid=lines.length>0&&lines.every(l=>{const text=received[l.id]??'',n=Number(text);return text.trim()!==''&&Number.isInteger(n)&&n>=0&&(n===l.sentQuantity||Boolean(reasons[l.id]?.trim()))});
    async function submit(e:React.FormEvent){
        e.preventDefault();
        if(!canReceive||!valid||lock.current)return;
        lock.current=true;setBusy(true);setError('');
        try{await onReceive(lines.map(l=>({id:l.id,received:Number(received[l.id]),reason:reasons[l.id]?.trim()})))}
        catch(e){setError(e instanceof Error?e.message:'No se pudo confirmar. Intenta nuevamente.')}
        finally{lock.current=false;setBusy(false)}
    }
    return <section className="transferReceiptCompact">
        <header><h1>{canReceive?'Recibir en':'Envío a'} {t.destination.toLocaleUpperCase('es-MX')}</h1><p>Desde {t.origin} · Pendiente de recepción</p></header>
        <form onSubmit={submit}>
            <div className="transferReceiptColumns" aria-hidden="true"><span>Producto</span><span>Enviado</span><span>Recibido</span></div>
            <ul className="transferReceiptLines">{lines.map(l=>{const text=received[l.id]??'',n=Number(text),different=text.trim()!==''&&Number.isFinite(n)&&n!==l.sentQuantity;return <li key={l.id}>
                <div className="transferReceiptLine"><div className="transferReceiptProduct"><b>{l.product}</b>{t.transferKind==='SALE'&&l.saleAmount!==null&&<small>{new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(l.saleAmount)}</small>}</div><span className="transferReceiptSent" aria-label={`${l.sentQuantity} piezas enviadas`}>{l.sentQuantity.toLocaleString('es-MX')}</span>
                    {canReceive?<input aria-label={`Cantidad recibida de ${l.product}`} type="number" min="0" step="1" inputMode="numeric" required value={text} disabled={busy} onChange={e=>setReceived({...received,[l.id]:e.target.value})}/>:<small className="transferReceiptWaiting">Pendiente</small>}
                </div>
                {canReceive&&different&&<label className="transferReceiptReason">Motivo de la diferencia<input aria-label={`Motivo de la diferencia de ${l.product}`} required maxLength={1000} value={reasons[l.id]??''} disabled={busy} placeholder="¿Qué ocurrió?" onChange={e=>setReasons({...reasons,[l.id]:e.target.value})}/></label>}
            </li>})}</ul>
            {t.transferKind==='SALE'&&<p className="transferReceiptSale">Total de venta <b>{new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(lines.reduce((sum,l)=>sum+(l.saleAmount??0),0))}</b></p>}
            <details className="transferReceiptDetails"><summary>Ver detalles</summary><p>Folio: {t.folio}</p><p>{t.origin} → {t.destination}</p></details>
            {!canReceive&&<p className="transferReceiptNote">La sucursal destino debe confirmar lo que llegó.</p>}
            {error&&<p role="alert" className="receivingError">{error}</p>}
            {canReceive&&<button type="submit" className="transferReceiptConfirm" disabled={busy||!valid}>{busy?'Confirmando…':'Confirmar recepción'}</button>}
        </form>
    </section>;
}
