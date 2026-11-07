'use client';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
export default function NewOrder({branches}:{branches:{id:string;name:string}[]}){
 const router=useRouter(),lock=useRef(false);const[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <form className="card pad formGrid" onSubmit={async e=>{
  e.preventDefault();if(lock.current)return;const form=new FormData(e.currentTarget),branchIds=form.getAll('branch');
  if(!branchIds.length){setError('Selecciona al menos una sucursal.');return;}
  lock.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/full-orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reference:form.get('reference'),title:form.get('title'),expectedPieces:form.get('expected')?Number(form.get('expected')):null,branchIds})});const j=await r.json();if(!r.ok)throw Error(j.error);router.push('/salidas/pedidos/'+j.id);router.refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo crear.');}finally{lock.current=false;setBusy(false);}
 }}><h2>Nuevo pedido FULL</h2><label>Número de pedido / envío de Mercado Libre<input name="reference" maxLength={80} required disabled={busy} placeholder="Ej. 81544435"/></label><label>Título<input name="title" maxLength={160} required disabled={busy} placeholder="Ej. FULL · Fundas y micas"/></label><label>Total de piezas en Mercado Libre (opcional)<input name="expected" type="number" min={1} max={10000000} step={1} inputMode="numeric" disabled={busy}/></label><fieldset disabled={busy}><legend>Sucursales que aportan producto</legend>{branches.map(b=><label key={b.id} style={{display:'flex',alignItems:'center',gap:10,minHeight:44}}><input type="checkbox" name="branch" value={b.id}/>{b.name}</label>)}</fieldset>{error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'Creando…':'Crear pedido'}</button></form>;
}
