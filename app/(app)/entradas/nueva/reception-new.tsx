"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type BranchOption={id:string;name:string};
export type ProductOption={id:string;name:string};
export default function NewReception({branches,products}:{branches:BranchOption[];products:ProductOption[]}){
 const [busy,setBusy]=useState(false);const [boxesInput,setBoxesInput]=useState("1");const [partial,setPartial]=useState(false);const [chosen,setChosen]=useState<number[]>([]);const [receivedDate,setReceivedDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));const router=useRouter();
 const boxes=Number(boxesInput);const validBoxes=Number.isInteger(boxes)&&boxes>=1;
 function changeBoxes(value:string){if(!/^\d*$/.test(value))return;setBoxesInput(value);const next=Number(value);setChosen(v=>Number.isInteger(next)&&next>=1?v.filter(n=>n<=next):[])}
 return <form className="card pad formGrid" onSubmit={async e=>{e.preventDefault();if(!validBoxes){alert('Ingresa el total de cajas esperadas.');return}if(partial&&!chosen.length){alert('Selecciona al menos una caja que haya llegado.');return}setBusy(true);const f=new FormData(e.currentTarget);const r=await fetch('/api/receptions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create',branchId:f.get('branch'),productId:f.get('product'),expectedBoxes:boxes,shippingMethod:f.get('shippingMethod'),receivedDate,partial,boxNumbers:chosen})});const j=await r.json() as {id?:string;error?:string};setBusy(false);if(r.ok&&j.id)router.push('/entradas/'+j.id);else alert(j.error||'ERROR')}}>
 <label>Sucursal<select name="branch" required>{branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
 <label>Producto<select name="product" required defaultValue=""><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
 <label>Total de cajas esperadas<input name="boxes" type="text" value={boxesInput} onChange={e=>changeBoxes(e.target.value)} placeholder="Ej. 35" required inputMode="numeric" pattern="[0-9]*" autoComplete="off"/></label>
 <label>Método de envío<select name="shippingMethod" defaultValue="PENDING"><option value="PENDING">Pendiente</option><option value="SEA">SEA</option><option value="AIR">AIR</option></select></label>
 <label>Fecha de llegada<input type="date" value={receivedDate} onChange={e=>setReceivedDate(e.target.value)} required/></label>
 <div className="partialQuestion"><b>¿Recepción parcial?</b><div className="yesNo"><button type="button" className={!partial?'active':''} onClick={()=>{setPartial(false);setChosen([])}}>NO</button><button type="button" className={partial?'active':''} onClick={()=>setPartial(true)}>SÍ</button></div></div>
 {partial&&validBoxes?<div><p className="selectHint">Selecciona las cajas que llegaron hoy:</p><div className="arrivalBoxes">{Array.from({length:boxes},(_,i)=>i+1).map(n=><button type="button" key={n} className={chosen.includes(n)?'selected':''} onClick={()=>setChosen(v=>v.includes(n)?v.filter(x=>x!==n):[...v,n].sort((a,b)=>a-b))}>{n}</button>)}</div><p className="arrivalSelection">{chosen.length?`${chosen.length} de ${boxes} recibidas: ${chosen.join(', ')}`:'Ninguna caja seleccionada'}</p></div>:partial?<div className="fullArrival"><small>Ingresa primero el total de cajas esperadas.</small></div>:<div className="fullArrival"><b>Recepción completa</b><small>{validBoxes?`Las ${boxes} cajas se marcarán como recibidas automáticamente.`:'Ingresa el total de cajas esperadas.'}</small></div>}
 <button className="primary" disabled={busy||products.length===0||!validBoxes}>{busy?'Creando…':'Crear recepción'}</button>{products.length===0&&<small>No hay productos activos. Un usuario MASTER debe crear un producto antes de iniciar la recepción.</small>}
 </form>
}
