"use client";

import{useState}from'react';
import{useRouter}from'next/navigation';

export type BranchOption={id:string;name:string};

export default function NewTransfer({origins,destinations}:{origins:BranchOption[];destinations:BranchOption[]}){
  const[busy,setBusy]=useState(false),router=useRouter();
  return <form className="card pad formGrid" onSubmit={async e=>{
    e.preventDefault();setBusy(true);
    const f=new FormData(e.currentTarget),r=await fetch('/api/transfers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',origin:f.get('origin'),destination:f.get('destination'),kind:f.get('kind')})}),j=await r.json()as{id?:string;error?:string};
    setBusy(false);if(r.ok&&j.id)router.push('/traspasos/'+j.id);else alert(j.error||'ERROR');
  }}>
    <label>Tipo de envío<select name="kind" required defaultValue="TRANSFER"><option value="TRANSFER">Envío por traspaso</option><option value="SALE">Envío por venta</option></select></label>
    <label>Origen<select name="origin" required>{origins.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <label>Destino<select name="destination" required>{destinations.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <button disabled={busy}>{busy?'Creando…':'Crear envío'}</button>
  </form>;
}
