'use client';
import {useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
type Style={id:string;name:string};
type Line={productId:string;quantity:number};
export default function FinalCount({orderId,revision,initial,products,plaza}:{orderId:string;revision:number;initial:Line[];products:Style[];plaza:Line[]}){
 const router=useRouter(),lock=useRef(false),[busy,setBusy]=useState(false),[refreshing,startRefresh]=useTransition(),[error,setError]=useState('');
 const [lines,setLines]=useState<{productId:string;quantity:string}[]>(initial.length?initial.map(l=>({...l,quantity:String(l.quantity)})):[{productId:plaza.length===1?plaza[0].productId:'',quantity:''}]);
 const [reason,setReason]=useState(''),[editing,setEditing]=useState(revision===0),disabled=busy||refreshing;
 const total=lines.reduce((n,l)=>n+(Number(l.quantity)||0),0);
 if(!editing)return <button type="button" onClick={()=>setEditing(true)}>Modificar cantidad del FULL</button>;
 return <form className="formGrid" onSubmit={async e=>{e.preventDefault();if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');try{
 const response=await fetch('/api/full-workflow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),action:'finalCount',payload:{orderId,previousRevision:revision,lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity)})),reason:reason.trim()||'Conteo global del FULL'}})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo guardar.');setEditing(false);startRefresh(()=>router.refresh());
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{lock.current=false;setBusy(false);}}}>
 <h2>Total final del FULL</h2><p>Cuenta lo que realmente se enviará. Treviño se calcula automáticamente, por estilo, sin contar primero las piezas apartadas.</p>
 {lines.map((line,i)=><fieldset disabled={disabled} key={i}><label>Estilo<select value={line.productId} required onChange={e=>setLines(lines.map((l,k)=>k===i?{...l,productId:e.target.value}:l))}><option value="">Selecciona…</option>{products.filter(p=>p.id===line.productId||!lines.some(l=>l.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Piezas finales<input type="number" min={0} max={10000000} step={1} required inputMode="numeric" value={line.quantity} onChange={e=>setLines(lines.map((l,k)=>k===i?{...l,quantity:e.target.value}:l))}/></label>{line.productId&&line.quantity!==''&&<p>Plaza: {plaza.find(l=>l.productId===line.productId)?.quantity??0} · Treviño: {Number(line.quantity)-(plaza.find(l=>l.productId===line.productId)?.quantity??0)>=0?'Salida':'Entrada'} de {Math.abs(Number(line.quantity)-(plaza.find(l=>l.productId===line.productId)?.quantity??0)).toLocaleString('es-MX')}</p>}{lines.length>1&&<button type="button" onClick={()=>setLines(lines.filter((_,k)=>k!==i))}>Quitar estilo</button>}</fieldset>)}
 <button type="button" disabled={disabled||lines.length>=500} onClick={()=>setLines([...lines,{productId:'',quantity:''}])}>+ Otro estilo</button>
 <strong>Total: {total.toLocaleString('es-MX')} piezas</strong>
 {revision>0&&<label>Motivo del cambio<input required maxLength={500} value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)}/></label>}
 <small>Guardar genera el ajuste pendiente; no confirma el registro en sistema. Los estilos enviados por Plaza que no incluyas en el FULL se calculan como entrada en Treviño.</small>
 <button disabled={disabled||total<=0}>{disabled?'Guardando…':'Guardar total y calcular Treviño'}</button>{revision>0&&<button type="button" disabled={disabled} onClick={()=>setEditing(false)}>Cancelar</button>}{error&&<p role="alert">{error}</p>}
 </form>;
}
