"use client";
import{useState}from'react';
import{useRouter}from'next/navigation';
export type BranchOption={id:string;name:string};
export default function NewExit({branches}:{branches:BranchOption[]}){
 const[busy,setBusy]=useState(false),[channel,setChannel]=useState('MERCADO_LIBRE'),router=useRouter();
 const other=channel==='OTHER';
 return <form className="card pad formGrid" onSubmit={async e=>{e.preventDefault();setBusy(true);const f=new FormData(e.currentTarget),r=await fetch('/api/exits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',branchId:f.get('branch'),channel,exitType:other?'INDEPENDENT_SALE':f.get('exitType'),reason:other?f.get('reason'):null})}),j=await r.json()as{id?:string;error?:string};setBusy(false);if(r.ok&&j.id)router.push('/salidas/'+j.id);else alert(j.error==='REASON_REQUIRED'?'Escribe el motivo de la salida.':j.error||'ERROR')}}>
  <label>Sucursal<select name="branch" required>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
  <label>Canal<select name="channel" required value={channel} onChange={e=>setChannel(e.target.value)}><option value="MERCADO_LIBRE">MercadoLibre</option><option value="TIKTOK">TikTok</option><option value="OTHER">Otro</option></select></label>
  {other?<label>Motivo<input name="reason" type="text" required maxLength={250} placeholder="Escribe el motivo de la salida…" autoComplete="off"/></label>:<label>Tipo<select name="exitType" required><option value="FULL">Full</option><option value="INDEPENDENT_SALE">Venta independiente</option></select></label>}
  <button disabled={busy}>{busy?'Creando…':'Crear salida'}</button>
 </form>
}
