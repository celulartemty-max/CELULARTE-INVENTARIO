'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';

export default function BoxProductChange({sessionId,orderId,boxes,products,onDone}:{sessionId:string;orderId:string;boxes:{id:string;carton_number:string}[];products:{id:string;name:string}[];onDone:()=>void}){
 const router=useRouter(),lock=useRef(false);
 const [selected,setSelected]=useState<string[]>([]),[range,setRange]=useState(''),[productId,setProduct]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function selectRange(){
  const match=range.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
  if(!match){setError('Escribe un rango como 1-12.');return}
  const from=Number(match[1]),to=Number(match[2]||match[1]);
  const found=boxes.filter(b=>/^\d+$/.test(b.carton_number)&&Number(b.carton_number)>=from&&Number(b.carton_number)<=to);
  if(from<1||to<from||to-from>999||found.length!==to-from+1){setError('Ese rango no está completo en este pedido. Selecciona las cajas individualmente.');return}
  setSelected(found.map(b=>b.id));setError('');
 }
 async function submit(e:React.FormEvent){
  e.preventDefault();if(lock.current)return;
  if(!confirm(`¿Cambiar ${selected.length} cajas a ${products.find(p=>p.id===productId)?.name}? Se conservarán sus números y conteos.`))return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/receiving',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'changeBoxProduct',sessionId,orderId,boxIds:selected,productId,reason})});const j=await r.json();if(!r.ok)throw Error(j.error||'No se pudo guardar.');onDone();router.refresh()}
  catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.')}finally{lock.current=false;setBusy(false)}
 }
 return <details className="card pad"><summary>Cambiar producto de cajas · Máster</summary><form className="receivingCompactForm" onSubmit={submit}>
  <p>Corrige el producto sin borrar el packing list ni los conteos. Si eliges parte del pedido, se mostrarán como un grupo separado dentro de esta misma recepción.</p>
  <label className="receivingField">Rango de cajas<input value={range} onChange={e=>setRange(e.target.value)} placeholder="Ej. 1-12" disabled={busy}/></label><button type="button" disabled={busy} onClick={selectRange}>Seleccionar rango</button>
  <fieldset disabled={busy}><legend>Cajas · {selected.length} seleccionadas</legend><div style={{display:'flex',flexWrap:'wrap',gap:8}}>{boxes.map(b=><label key={b.id} style={{display:'flex',alignItems:'center',gap:6,minHeight:44,padding:8}}><input type="checkbox" checked={selected.includes(b.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,b.id]:old.filter(id=>id!==b.id))}/>Caja {b.carton_number}</label>)}</div></fieldset>
  <label className="receivingField">Producto correcto<select required value={productId} onChange={e=>setProduct(e.target.value)} disabled={busy}><option value="">Selecciona un producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label className="receivingField">Motivo del cambio<textarea required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
  {error&&<p role="alert" className="receivingError">{error}</p>}<button className="receivingSave" disabled={busy||!selected.length||!productId||reason.trim().length<5}>{busy?'Guardando…':'Guardar cambio de producto'}</button>
 </form></details>;
}
