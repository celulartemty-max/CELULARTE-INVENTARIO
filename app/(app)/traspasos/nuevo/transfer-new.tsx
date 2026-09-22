"use client";

import{useMemo,useState}from'react';
import{useRouter}from'next/navigation';

export type BranchOption={id:string;name:string;isInternal:boolean};

export default function NewTransfer({origins,destinations}:{origins:BranchOption[];destinations:BranchOption[]}){
  const[busy,setBusy]=useState(false),[origin,setOrigin]=useState(origins[0]?.id??''),router=useRouter();
  const available=useMemo(()=>destinations.filter(b=>b.id!==origin),[destinations,origin]);
  return <form className="card pad formGrid" onSubmit={async e=>{
    e.preventDefault();setBusy(true);
    const f=new FormData(e.currentTarget),r=await fetch('/api/transfers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',origin:f.get('origin'),destination:f.get('destination'),kind:f.get('kind')})}),j=await r.json()as{id?:string;error?:string};
    setBusy(false);if(r.ok&&j.id)router.push('/traspasos/'+j.id);else alert(j.error==='INVALID_ORIGIN_BRANCH'?'Solo Treviño y Plaza del Audio pueden ser sucursales de origen.':j.error||'ERROR');
  }}>
    <label>Tipo de envío<select name="kind" required defaultValue="TRANSFER"><option value="TRANSFER">Envío por traspaso</option><option value="SALE">Envío por venta</option></select></label>
    <label>Origen<select name="origin" required value={origin} onChange={e=>setOrigin(e.target.value)}>{origins.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><small style={{display:'block',marginTop:5,color:'#667085'}}>Solo sucursales con control de inventario.</small></label>
    <label>Destino<select name="destination" required defaultValue=""><option value="" disabled>Selecciona un destino…</option>{available.map(b=><option key={b.id} value={b.id}>{b.name}{b.isInternal?'':' · Externa'}</option>)}</select><small style={{display:'block',marginTop:5,color:'#667085'}}>Las sucursales externas se cierran al enviar y no confirman recepción.</small></label>
    <button disabled={busy||!origin}>{busy?'Creando…':'Crear envío'}</button>
  </form>;
}
