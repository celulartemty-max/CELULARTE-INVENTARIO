'use client';
import {useState} from 'react';
import {parseCartonNumbers} from '@/lib/inventory/receiving-validation';
export type Batch = {id:string;reference:string;product:string;shipping:string;marking:string;is_foreign:boolean;total:number;received_here:number;received_total:number;remaining:number};
export type PendingCarton = {id:string;order_id:string;carton_number:string;reference:string;product:string;shipping:string;marking:string;is_foreign:boolean};
type Save = (body:Record<string,unknown>)=>Promise<boolean>;
export default function BatchIntake({batches,pending,products,busy,draft,save}:{batches:Batch[];pending:PendingCarton[];products:{id:string;name:string}[];busy:boolean;draft:boolean;save:Save}){
 const [isForeign,setIsForeign]=useState(false),[total,setTotal]=useState(''),[formKey,setFormKey]=useState(0);
 return <section className="card pad"><h2>1. Separar la llegada por pedidos</h2><p>Un bonche = un pedido. Captura una sola vez producto, transporte y marca. El total del pedido puede ser mayor que las cajas que llegaron hoy.</p>
 <div className="receivingTable"><table><thead><tr><th>Pedido / producto</th><th>Transporte / marca</th><th>Destino</th><th>Total del pedido</th><th>En esta recepción</th><th>Recibidas acumuladas</th><th>Faltan por llegar</th></tr></thead><tbody>{batches.map(b=><tr key={b.id}><td><b>{b.reference}</b><br/>{b.product}</td><td>{b.shipping} · {b.marking}</td><td>{b.is_foreign?'Ajenas':'Esta sucursal'}</td><td>{b.total}</td><td>{b.received_here}</td><td>{b.received_total}</td><td>{b.remaining}</td></tr>)}</tbody></table></div>
 {!batches.length&&<p>Empieza agregando el primer pedido de esta llegada.</p>}
 {draft&&<details className="receivingNewBatch" open={!batches.length}><summary>+ Agregar pedido / bonche nuevo</summary><form key={formKey} className="formGrid" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const ok=await save({action:'batch',reference:f.get('reference'),productId:f.get('product')||null,productLabel:f.get('productLabel')||'',isForeign,shipping:f.get('shipping'),marking:f.get('marking'),total:Number(total),received:Number(f.get('received')),numbers:f.get('numbers')});if(ok){setFormKey(k=>k+1);setTotal('');setIsForeign(false)}}}>
 <label>Referencia / nombre único del pedido<input name="reference" required maxLength={160} placeholder="Ej. COMBO-PER-20 / folio del proveedor"/></label>
 <label>¿De quién son estas cajas?<select value={isForeign?'foreign':'own'} onChange={e=>setIsForeign(e.target.value==='foreign')}><option value="own">De esta sucursal</option><option value="foreign">Ajenas · solo registro</option></select></label>
 <label>Tipo de producto<select name="product" required={!isForeign}><option value="">{isForeign?'Escribir producto abajo…':'Selecciona…'}</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {isForeign&&<label>Producto escrito en la caja (si no está en catálogo)<input name="productLabel" maxLength={160} placeholder="Ej. PREMIUM LENS"/></label>}
 <label>Transporte<select name="shipping" required defaultValue=""><option value="" disabled>Selecciona…</option><option>SEA</option><option>AIR</option></select></label>
 <label>Marca escrita en las cajas<input name="marking" required maxLength={160} placeholder="Ej. PER NICO / JAPS LISA / CDMX"/></label>
 <label>Total de cajas del pedido (según 1/20, 2/20…)<input type="number" min={1} max={1000} step={1} required value={total} onChange={e=>setTotal(e.target.value)} placeholder="20"/></label>
 <ArrivalNumbers key={total} total={Number(total)} allNumbers={Number(total)>0&&Number(total)<=1000?Array.from({length:Number(total)},(_,i)=>String(i+1)):[]} />
 <p>Solo las recibidas hoy se sumarán a esta recepción. Las demás quedarán pendientes del mismo pedido. El packing list se agrega después, únicamente para cajas propias.</p>
 <button disabled={busy}>Guardar pedido y llegada del bonche</button></form></details>}
 {draft&&batches.some(b=>b.remaining>0)&&<><h3>Recibir faltantes de un pedido ya registrado</h3><p>No crees el pedido otra vez. Selecciónalo aquí y conserva su mismo packing list.</p>{batches.filter(b=>b.remaining>0).map(b=><ExistingArrival key={b.id+':'+b.remaining} batch={b} boxes={pending.filter(p=>p.order_id===b.id)} busy={busy} save={save}/>)}</>}
 </section>;
}
function ArrivalNumbers({total,allNumbers}:{total:number;allNumbers:string[]}){
 const [received,setReceived]=useState(''),[numbers,setNumbers]=useState('');let length=0;try{length=parseCartonNumbers(numbers,total).length}catch{}
 return <><label>Cajas que llegaron hoy<input name="received" type="number" required min={1} max={total||1000} step={1} value={received} onChange={e=>setReceived(e.target.value)} placeholder="18"/></label><label>Números de las cajas recibidas<input name="numbers" required maxLength={6000} value={numbers} onChange={e=>setNumbers(e.target.value)} placeholder="Ej. 1-18 o 1-12,15-20"/><small>Escribe los números antes de la diagonal. No suponemos cuáles faltaron.</small></label><button type="button" disabled={!allNumbers.length} onClick={()=>{setReceived(String(allNumbers.length));setNumbers(allNumbers.join(','))}}>Llegaron todas las {allNumbers.length} cajas {allNumbers.length===total?'del pedido':'pendientes'}</button>{numbers&&<small>{length} números identificados · Cantidad declarada: {received||'—'}</small>}</>;
}
function ExistingArrival({batch,boxes,busy,save}:{batch:Batch;boxes:PendingCarton[];busy:boolean;save:Save}){
 const [error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]);
 return <details className="card pad"><summary><b>{batch.reference}</b> · {batch.product} · {batch.remaining} de {batch.total} pendientes · {batch.is_foreign?'Ajenas':'Propias'}</summary><p>{batch.shipping} · {batch.marking} · Pendientes: {boxes.map(b=>b.carton_number).join(', ')}</p>
 <form className="formGrid" onSubmit={async e=>{e.preventDefault();setError('');const f=new FormData(e.currentTarget);try{const numbers=parseCartonNumbers(String(f.get('numbers')),batch.total);if(numbers.length!==Number(f.get('received')))throw Error('La cantidad recibida no coincide con los números indicados.');const ids=numbers.map(n=>{const matching=boxes.filter(b=>b.carton_number===n||new RegExp('^0*'+n+'\\s*/\\s*'+batch.total+'$').test(b.carton_number));if(matching.length!==1)throw Error(`La caja ${n} ya llegó o no está pendiente en este pedido.`);return matching[0].id});await save({action:'arrive',boxIds:ids})}catch(e){setError(e instanceof Error?e.message:'Revisa las cajas.')}}}>
 <ArrivalNumbers total={batch.total} allNumbers={boxes.map(b=>b.carton_number)}/><button disabled={busy}>Registrar estas cajas en la recepción actual</button>{error&&<p role="alert">{error}</p>}</form>
 <details><summary>Seleccionar números individualmente (formatos especiales)</summary>{boxes.map(b=><label className="receivingPending" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/>{b.carton_number}</label>)}<button disabled={busy||!selected.length} onClick={async()=>{if(await save({action:'arrive',boxIds:selected}))setSelected([])}}>Registrar {selected.length} seleccionadas</button></details>
 </details>;
}
