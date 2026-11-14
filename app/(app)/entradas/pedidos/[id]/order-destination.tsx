'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

export default function OrderDestination({orderId,destination,disabled=false}:{orderId:string;destination?:string;disabled?:boolean}){
 const router=useRouter();
 const [open,setOpen]=useState(false),[selected,setSelected]=useState(destination??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){
  if(busy||disabled||!selected)return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/receiving/count-permission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'destination',orderId,destination:selected})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo cambiar el destino.');
   setOpen(false);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el destino.')}finally{setBusy(false)}
 }
 return <div className="receivingOrderDestination"><button type="button" className="receivingSecondary" disabled={busy||disabled} aria-expanded={open} aria-label={`Cambiar destino del pedido: ${destination||'sin destino'}`} onClick={()=>{if(!open)setSelected(destination??'');setOpen(v=>!v)}}>Destino</button>
  {open&&<form className="receivingDestinationChoice" onSubmit={e=>{e.preventDefault();return save()}}><label className="receivingField">¿Dónde se quedan las cajas?<select required value={selected} disabled={busy||disabled} onChange={e=>setSelected(e.target.value)}><option value="" disabled>Selecciona destino…</option><option>Treviño</option><option>Plaza del Audio</option></select></label><p>Todo el pedido conservará su marca, packing y conteos. El registro en sistema corresponderá al destino elegido; si las cajas viajan a otra sucursal, primero deberá confirmar su llegada.</p><button disabled={busy||disabled||!selected}>{busy?'Guardando…':'Guardar destino'}</button></form>}
  {error&&<p role="alert" className="receivingError">{error}</p>}
 </div>;
}
