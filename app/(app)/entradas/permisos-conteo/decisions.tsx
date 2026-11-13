'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function Decisions({orderId,userId,approved}:{orderId:string;userId:string;approved:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const router=useRouter();
 async function decide(action:'approve'|'deny'){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/receiving/count-permission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,orderId,userId})});const j=await r.json();if(!r.ok)throw Error(j.error);router.refresh()}catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar.')}finally{setBusy(false)}}
 return <div className="actions">{!approved&&<button disabled={busy} onClick={()=>decide('approve')}>Autorizar conteo</button>}<button disabled={busy} onClick={()=>decide('deny')}>{approved?'Revocar permiso':'Rechazar'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
