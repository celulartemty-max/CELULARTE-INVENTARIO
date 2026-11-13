'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function CountPermissionNotice({orderId,mark,allowed,state}:{orderId:string;mark:string;allowed?:boolean;state?:string|null}){
 const [pending,setPending]=useState(state==='PENDING'),[busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 if(allowed!==false)return null;
 return <aside className="card pad" role="status"><b>Este pedido pertenece a {mark==='JAPS'?'Plaza del Audio':'Treviño'} ({mark}).</b><p>Puedes verlo, pero necesitas autorización para contar sus cajas.</p>{pending?<p>Solicitud enviada · Pendiente de aprobación.</p>:<><p>¿Quieres solicitar permiso para contarlo?</p><button type="button" className="receivingSecondary" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/receiving/count-permission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'request',orderId})});const j=await r.json();if(!r.ok)throw Error(j.error);setPending(true);router.refresh()}catch(e){setError(e instanceof Error?e.message:'No se pudo solicitar permiso.')}finally{setBusy(false)}}}>{busy?'Enviando…':'Solicitar permiso para contar'}</button></>}{error&&<p role="alert" className="receivingError">{error}</p>}</aside>;
}
