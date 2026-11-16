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
 const plazaTotal=plaza.reduce((n,l)=>n+l.quantity,0);
 const trevinoTotal=total-plazaTotal;
 const valid=lines.every(l=>l.productId&&l.quantity!==''&&Number.isInteger(Number(l.quantity))&&Number(l.quantity)>=0&&Number(l.quantity)<=10000000)&&total>0&&total<=10000000;
 if(!editing)return <button type="button" onClick={()=>setEditing(true)}>Modificar cantidad del FULL</button>;
 return <form className="formGrid" onSubmit={async e=>{e.preventDefault();if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');try{
 const response=await fetch('/api/full-workflow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),action:'finalCount',payload:{orderId,previousRevision:revision,lines:lines.map(l=>({productId:l.productId,quantity:Number(l.quantity)})),reason:reason.trim()||'Conteo global del FULL'}})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo guardar.');setEditing(false);startRefresh(()=>router.refresh());
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{lock.current=false;setBusy(false);}}}>
 <h2>Total del FULL</h2>
 {lines.map((line,i)=><div className="fullCountLine" key={i}>
 <label>Producto<select value={line.productId} required disabled={disabled} onChange={e=>setLines(lines.map((l,k)=>k===i?{...l,productId:e.target.value}:l))}><option value="">Selecciona…</option>{products.filter(p=>p.id===line.productId||!lines.some(l=>l.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <label>Total<input type="number" min={0} max={10000000} step={1} required inputMode="numeric" disabled={disabled} value={line.quantity} onChange={e=>setLines(lines.map((l,k)=>k===i?{...l,quantity:e.target.value}:l))}/></label>
 {lines.length>1&&<button type="button" disabled={disabled} onClick={()=>setLines(lines.filter((_,k)=>k!==i))}>Quitar</button>}
 </div>)}
 {products.length>1&&<button type="button" disabled={disabled||lines.length>=500} onClick={()=>setLines([...lines,{productId:'',quantity:''}])}>+ Producto</button>}
 <div aria-live="polite" className="fullCountPreview"><strong>Treviño: {trevinoTotal.toLocaleString('es-MX')} piezas</strong><small>Total FULL {total.toLocaleString('es-MX')} − Plaza {plazaTotal.toLocaleString('es-MX')}</small></div>
 {revision>0&&<label>Motivo del cambio<input required maxLength={500} value={reason} disabled={disabled} onChange={e=>setReason(e.target.value)}/></label>}
 <button disabled={disabled||!valid||(revision>0&&!reason.trim())}>{disabled?'Guardando…':'Guardar'}</button>
 {revision>0&&<button type="button" disabled={disabled} onClick={()=>setEditing(false)}>Cancelar</button>}
 {error&&<p role="alert">{error}</p>}
 </form>;
}
