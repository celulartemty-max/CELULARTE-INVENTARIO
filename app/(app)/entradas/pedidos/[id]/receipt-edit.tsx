'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
type Box={id:string;order_id:string;carton_number:string;product:string;counted_at?:string|null};
export default function ReceiptEdit({sessionId,total,boxes,orders}:{sessionId:string;total:number;boxes:Box[];orders:{id:string;product:string;marking:string}[]}){
 const router=useRouter(),lock=useRef(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!open)return <button type="button" className="receivingSecondary" onClick={()=>setOpen(true)}>Editar recepción</button>;
 return <section className="card pad"><h2>Editar recepción</h2><form className="receivingCompactForm" onSubmit={async e=>{e.preventDefault();if(lock.current)return;const f=new FormData(e.currentTarget);if(!confirm('¿Guardar estos cambios en la recepción? Las cajas retiradas quedarán pendientes de llegar; su información se conserva.'))return;lock.current=true;setBusy(true);setError('');try{
 const numbers=String(f.get('numbers')||'').split(/[\s,]+/).filter(Boolean);
 const r=await fetch('/api/receiving',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'editReceipt',sessionId,total:Number(f.get('total')),remove:f.getAll('remove'),orderId:f.get('orderId')||null,numbers,reason:f.get('reason')})});const j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo guardar.');setOpen(false);router.refresh();
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.')}finally{lock.current=false;setBusy(false)}}}>
 <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
 <label className="receivingField">Total de cajas recibidas<input name="total" type="number" inputMode="numeric" min={1} max={1000} required defaultValue={total}/></label>
 <details><summary>Retirar cajas de esta recepción</summary><p>Se conservan como pendientes de llegar, sin borrar su packing list. Las cajas con conteo o registro están protegidas.</p>{boxes.map(b=><label key={b.id} style={{display:'flex',alignItems:'center',gap:10,minHeight:44}}><input type="checkbox" name="remove" value={b.id} disabled={!!b.counted_at}/><span>{b.product} · Caja {b.carton_number}{b.counted_at?' · Contada':''}</span></label>)}</details>
 <details><summary>Agregar cajas a un pedido existente</summary><label className="receivingField">Pedido<select name="orderId" defaultValue=""><option value="">Selecciona…</option>{orders.map(o=><option value={o.id} key={o.id}>{o.product} · {o.marking}</option>)}</select></label><label className="receivingField">Números de caja<input name="numbers" placeholder="Ej. 3, 4, 5" maxLength={6000}/></label></details>
 <p>Para un pedido nuevo, aumenta el total y después usa «Agregar pedido».</p>
 <label className="receivingField">Motivo del cambio<textarea name="reason" required minLength={5} maxLength={1000}/></label>
 {error&&<p role="alert" className="receivingError">{error}</p>}
 <div className="actions"><button type="submit" className="receivingPrimary">{busy?'Guardando…':'Guardar cambios'}</button><button type="button" className="receivingSecondary" onClick={()=>setOpen(false)}>Cancelar</button></div>
 </fieldset></form></section>;
}
