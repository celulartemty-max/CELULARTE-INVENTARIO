"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type BranchOption={id:string;name:string};
export type ProductOption={id:string;name:string};
export default function NewReception({branches,products}:{branches:BranchOption[];products:ProductOption[]}){
 const [busy,setBusy]=useState(false);const [boxes,setBoxes]=useState(1);const [partial,setPartial]=useState(false);const [chosen,setChosen]=useState<number[]>([]);const [receivedDate,setReceivedDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));const router=useRouter();
 function changeBoxes(value:number){const next=Math.max(1,Math.floor(value||1));setBoxes(next);setChosen(v=>v.filter(n=>n<=next))}
 return <form className="card pad formGrid" onSubmit={async e=>{e.preventDefault();if(partial&&!chosen.length){alert('Selecciona al menos una caja que haya llegado.');return}setBusy(true);const f=new FormData(e.currentTarget);const r=await fetch('/api/receptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',branchId:f.get('branch'),productId:f.get('product'),expectedBoxes:boxes,shippingMethod:f.get('shippingMethod'),receivedDate,partial,boxNumbers:chosen})});const j=await r.json() as {id?:string;error?:string};setBusy(false);if(r.ok&&j.id)router.push('/entradas/'+j.id);else alert(j.error||'ERROR')}}>
 <label>Sucursal<select name="branch" required>{branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
 <label>Producto<select name="product" required defaultValue=""><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
 <label>Total de cajas esperadas<input name="boxes" type="number" min="1" value={boxes} onChange={e=>changeBoxes(Number(e.target.value))} required inputMode="numeric"/></label>
 <label>Método de envío<select name="shippingMethod" defaultValue="PENDING"><option value="PENDING">Pendiente</option><option value="SEA">SEA</option><option value="AIR">AIR</option></select></label>
 <label>Fecha de llegada<input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)} required/></label>
 <div className="partialQuestion"><b>¿Recepción parcial?</b><div className="yesNo"><button type="button" className={!partial?'active':''} onClick={()=>{setPartial(false);setChosen([])}}>NO</button><button type="button" className={partial?'active':''} onClick={()=>setPartial(true)}>SÍ</button></div></div>
 {partial?<div><p className="selectHint">Selecciona las cajas que llegaron hoy:</p><div className="arrivalBoxes">{Array.from({length:boxes},(_,i)=>i+1).map(n=><button type="button" key={n} className={chosen.includes(n)?'selected':''} onClick={()=>setChosen(v=>v.includes(n)?v.filter(x=>x!==n):[...v,n].sort((a,b)=>a-b))}>{n}</button>)}</div><p className="arrivalSelection">{chosen.length?`${chosen.length} de ${boxes} recibidas: ${chosen.join(', ')}`:'Ninguna caja seleccionada'}</p></div>:<div className="fullArrival"><b>Recepción completa</b><small>Las {boxes} cajas se marcarán como recibidas automáticamente.</small></div>}
 <button className="primary" disabled={busy||products.length===0}>{busy?'Creando…':'Crear recepción'}</button>{products.length===0&&<small>No hay productos activos. Un usuario MASTER debe crear un producto antes de iniciar la recepción.</small>}
 </form>
}
