'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export default function EditName({id,title}:{id:string;title:string}){
 const router=useRouter(),lock=useRef(false),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!editing)return <button type="button" className="fullEditNameButton" onClick={()=>{setError('');setEditing(true);}}>Editar nombre</button>;
 return <form className="fullEditNameForm" onSubmit={async e=>{
  e.preventDefault();if(lock.current)return;const value=String(new FormData(e.currentTarget).get('title')||'').trim();if(!value){setError('Escribe un nombre.');return;}
  lock.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/full-orders',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,title:value,previousTitle:title})});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo guardar.');setEditing(false);router.refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{lock.current=false;setBusy(false);}
 }}><label>Nombre del pedido<input name="title" defaultValue={title} maxLength={160} required disabled={busy} autoFocus/></label><div><button type="submit" disabled={busy}>{busy?'Guardando…':'Guardar'}</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</button></div>{error&&<p role="alert">{error}</p>}</form>;
}
