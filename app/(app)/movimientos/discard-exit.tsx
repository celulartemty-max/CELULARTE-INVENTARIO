'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export default function DiscardExit({id}:{id:string}){
 const router=useRouter(),lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div style={{padding:'0 18px 12px'}}><button type="button" disabled={busy} style={{minHeight:44,color:'#ad2b2b',background:'transparent'}} onClick={async()=>{
  if(lock.current||!confirm('¿Descartar esta salida vacía? Se quitará de pendientes y quedará cancelada en el historial.'))return;
  lock.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/exits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'discardEmpty',movementId:id})});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo descartar.');router.refresh();}catch(e){setError(e instanceof Error?e.message:'No se pudo descartar.');}finally{lock.current=false;setBusy(false);}
 }}>{busy?'Descartando…':'Descartar salida'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
