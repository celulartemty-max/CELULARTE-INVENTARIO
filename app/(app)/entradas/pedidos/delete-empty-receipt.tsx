'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function DeleteEmptyReceipt({id,title}:{id:string;title:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><button type="button" className="receivingSecondary" disabled={busy} onClick={async()=>{
  if(busy||!confirm(`¿Borrar ${title}? Solo se eliminará si sigue completamente vacía.`))return;
  setBusy(true);setError('');try{const r=await fetch('/api/receiving',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'deleteEmptyReceipt',sessionId:id,confirm:true})});const value=await r.json();if(!r.ok)throw Error(value.error||'No se pudo borrar.');router.refresh();}catch(e){setError(e instanceof Error?e.message:'No se pudo borrar.');}finally{setBusy(false);}
 }}>{busy?'Borrando…':'Borrar recepción'}</button>{error&&<p role="alert" className="receivingError">{error}</p>}</div>;
}
