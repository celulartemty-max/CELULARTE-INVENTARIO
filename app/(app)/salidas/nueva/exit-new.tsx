"use client";
import{useRef,useState}from'react';
import{useRouter}from'next/navigation';
export type BranchOption={id:string;name:string};
export default function NewExit({branches,canCreateFull=false}:{branches:BranchOption[];canCreateFull?:boolean}){
 const[busy,setBusy]=useState(false),[channel,setChannel]=useState('MERCADO_LIBRE'),[exitType,setExitType]=useState('FULL'),[error,setError]=useState(''),router=useRouter(),lock=useRef(false);
 const isFull=channel==='MERCADO_LIBRE'&&exitType==='FULL';
 return <form className="card pad formGrid" onSubmit={async e=>{
  e.preventDefault();if(lock.current)return;const f=new FormData(e.currentTarget);const isOther=channel==='OTHER';
  if(isFull&&!canCreateFull){setError('No tienes permiso de Salidas para iniciar pedidos FULL.');return;}
  lock.current=true;setBusy(true);setError('');
  try{
   const body=isFull?{reference:f.get('reference'),title:f.get('title'),expectedPieces:null}:{action:'create',branchId:f.get('branch'),channel,exitType:isOther?'INDEPENDENT_SALE':exitType,reason:isOther?f.get('reason'):undefined};
   const r=await fetch(isFull?'/api/full-orders':'/api/exits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const j=await r.json()as{id?:string;error?:string};if(!r.ok||!j.id)throw Error(j.error||'No se pudo crear la salida.');router.push((isFull?'/salidas/pedidos/':'/salidas/')+j.id);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo crear la salida.');}finally{lock.current=false;setBusy(false);}
 }}>
  {!isFull&&<label>Sucursal<select name="branch" required disabled={busy}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
  <label>Canal<select name="channel" required value={channel} disabled={busy} onChange={e=>setChannel(e.target.value)}><option value="MERCADO_LIBRE">MercadoLibre</option><option value="TIKTOK">TikTok</option><option value="OTHER">Otro</option></select></label>
  {channel==='OTHER'?<label>Motivo<input name="reason" required disabled={busy} placeholder="Escribe el motivo de la salida" autoComplete="off"/></label>:<label>Tipo<select name="exitType" required value={exitType} disabled={busy} onChange={e=>setExitType(e.target.value)}><option value="FULL">Full</option><option value="INDEPENDENT_SALE">Venta independiente</option></select></label>}
  {isFull&&(canCreateFull?<><label>Número de pedido / envío de Mercado Libre<input name="reference" maxLength={80} required disabled={busy}/></label><label>Título<input name="title" maxLength={160} required disabled={busy}/></label></>:<p>Necesitas acceso a Salidas para iniciar un pedido FULL.</p>)}
  {error&&<p role="alert">{error}</p>}
  <button disabled={busy||(isFull&&!canCreateFull)}>{busy?'Creando…':isFull?'Crear pedido FULL':'Crear salida'}</button>
 </form>
}
