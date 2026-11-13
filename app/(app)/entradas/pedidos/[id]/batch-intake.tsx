'use client';
import {useId,useRef,useState} from 'react';
import {batchSchema} from '@/lib/inventory/receiving-validation';
import ReceivingModal from './receiving-modal';
import {SHIPPING_MARKS} from '@/lib/inventory/shipping-marks';
export type Batch = {is_mixed?:boolean;display_title?:string;id:string;reference:string;product:string;shipping:string;marking:string;supplier?:string;is_foreign:boolean;destination_name?:string;total:number;received_here:number;received_total:number;remaining:number;counted_here?:number;registered_here?:number};
export function BatchStatus({batch:b}:{batch:Batch}){
 if(b.is_foreign&&!['Treviño','Plaza del Audio'].includes(b.destination_name??''))return <span className="receivingBatchStatus neutral">Solo registro</span>;
 const total=b.received_here,counted=b.counted_here??0,registered=b.registered_here??0;
 const done=total>0&&counted===total,confirmed=done&&registered===total;
 return <div className="receivingBatchProgress" aria-label={b.is_foreign?'Estado en destino':'Estado de las cajas de esta recepción'}>
  <span className={`receivingBatchStatus ${confirmed?'registered':done?'counted':'pending'}`}>{confirmed?'✓ Registrado en sistema':done?`✓ Contadas · ${counted}/${total}`:`◷ Pendientes · ${counted}/${total} contadas`}</span>
  {registered>0&&!confirmed&&<small>{registered}/{total} registradas</small>}
 </div>;
}
export type PendingCarton = {id:string;order_id:string;carton_number:string;reference:string;product:string;shipping:string;marking:string;is_foreign:boolean};
type Save = (body:Record<string,unknown>)=>Promise<boolean>;
export default function BatchIntake({batches,pending,products,busy,draft,save,onOpen,error}:{batches:Batch[];pending:PendingCarton[];products:{id:string;name:string}[];busy:boolean;draft:boolean;save:Save;onOpen:(id:string)=>void;error?:string}){
 const [modal,setModal]=useState<'new'|'pending'|null>(null),[pendingId,setPendingId]=useState('');
 const here=batches.filter(b=>b.received_here>0),missing=batches.filter(b=>b.remaining>0),selected=missing.find(b=>b.id===pendingId);
 return <section className="card pad"><div className="receivingListHeader"><h2>Pedidos de esta recepción</h2>{draft&&<div className="actions"><button className="receivingPrimary" disabled={busy} onClick={()=>setModal('new')}>+ Agregar pedido</button>{missing.length>0&&<button className="receivingSecondary" disabled={busy} onClick={()=>{setPendingId('');setModal('pending')}}>Recibir faltantes</button>}</div>}</div>
 {here.length?<div className="receivingTable"><table><thead><tr><th>Producto / marca</th><th>Destino</th><th>Llegaron</th><th>Faltan del pedido</th><th/></tr></thead><tbody>{here.map(b=><tr key={b.id}><td><button type="button" className="receivingOrderOpen" aria-label={`Ver ${b.product}, ${b.marking}`} disabled={busy} onClick={()=>onOpen(b.id)}><b>{b.product}</b><strong>{b.marking}{b.display_title?` · ${b.display_title}`:''}</strong><small className="receivingMuted">{b.shipping}</small><span>Ver pedido ›</span></button><BatchStatus batch={b}/></td><td>{b.destination_name||(b.is_foreign?'Ajenas':'Esta sucursal')}</td><td><b>{b.received_here}</b> <small>de {b.total}</small></td><td>{b.remaining}</td><td><button className="receivingSecondary" disabled={busy} onClick={()=>onOpen(b.id)}>Abrir pedido</button></td></tr>)}</tbody></table></div>:<div className="receivingEmpty"><p>Aún no has agregado pedidos.</p>{draft&&<small>Pulsa “Agregar pedido” para empezar.</small>}</div>}
 {modal==='new'&&<ReceivingModal title="Agregar pedido" busy={busy} onClose={()=>setModal(null)}><NewBatchForm products={products} busy={busy} save={save} onSaved={()=>setModal(null)}/>{error&&<p role="alert" className="receivingError">{error}</p>}</ReceivingModal>}
 {modal==='pending'&&<ReceivingModal title="Recibir cajas pendientes" busy={busy} onClose={()=>setModal(null)}><label className="receivingField">Pedido<select value={pendingId} disabled={busy} onChange={e=>setPendingId(e.target.value)}><option value="">Selecciona…</option>{missing.map(b=><option key={b.id} value={b.id}>{b.product} · {b.marking} · {b.remaining} pendientes · {b.reference}</option>)}</select></label>{selected&&<ExistingArrival key={selected.id+':'+selected.remaining} batch={selected} boxes={pending.filter(p=>p.order_id===selected.id)} busy={busy} save={async value=>{const ok=await save(value);if(ok)setModal(null);return ok}}/>}{error&&<p role="alert" className="receivingError">{error}</p>}</ReceivingModal>}
 </section>;
}
export function NewBatchForm({products,busy,save,onSaved}:{products:{id:string;name:string}[];busy:boolean;save:Save;onSaved:()=>void}){
 const [isForeign,setIsForeign]=useState(false),[total,setTotal]=useState(''),[error,setError]=useState('');
 const generated=useRef('');
 const [selectedBoxes,setSelectedBoxes]=useState<string[]>([]);
 const validTotal=Number.isInteger(Number(total))&&Number(total)>0&&Number(total)<=1000?Number(total):0;
 const arrived=selectedBoxes.filter(n=>Number(n)<=validTotal);
 const selectBoxes=(values:string[])=>setSelectedBoxes(values);
 const [marking,setMarking]=useState('');const external=!!marking&&!['PER','JAPS'].includes(marking);
 const [mixed,setMixed]=useState(false);
 const [search,setSearch]=useState(''),[selectedProduct,setSelectedProduct]=useState('');
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1);const listId=useId();
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const terms=normalize(search).trim().split(/\s+/).filter(Boolean);
 const matches=products.filter(p=>terms.every(term=>normalize(p.name).includes(term)));
 const choose=(product:{id:string;name:string})=>{setSelectedProduct(product.id);setSearch(product.name);setOpen(false);setActive(-1)};
 return <form className="receivingCompactForm" onSubmit={async e=>{e.preventDefault();setError('');const f=new FormData(e.currentTarget);if(!generated.current)generated.current=crypto.randomUUID().slice(0,8);const product=products.find(p=>p.id===f.get('product'));const reference=String(f.get('reference')||'').trim()||String(product?.name||f.get('productLabel')||'Pedido').slice(0,80)+' · '+String(f.get('marking')).slice(0,60)+'-'+generated.current;
 if(!isForeign&&!mixed&&!products.some(p=>p.id===f.get('product'))){setError('Selecciona un producto de la lista.');return}
 const value={reference,productId:mixed?null:f.get('product')||null,productLabel:mixed?'Pedido mixto':f.get('productLabel')||'',isForeign,isMixed:mixed&&!external,shipping:f.get('shipping'),marking:f.get('marking'),total:Number(total),received:arrived.length,numbers:arrived.join(',')};const parsed=batchSchema.safeParse(value);if(!parsed.success){setError(arrived.length?parsed.error.issues.map(i=>i.message).join(' '):'Selecciona al menos una caja que llegó.');return}if(await save({action:'batch',...parsed.data,supplier:String(f.get('supplier')||'')}))onSaved()}}>
 <fieldset disabled={busy}>
 <label className="receivingField">Shipping Mark<select name="marking" required value={marking} onChange={e=>{setMarking(e.target.value);setIsForeign(!['PER','JAPS'].includes(e.target.value))}}><option value="" disabled>Selecciona…</option>{SHIPPING_MARKS.map(mark=><option key={mark}>{mark}</option>)}</select></label>
 {!external&&<label><input type="checkbox" checked={mixed} onChange={e=>setMixed(e.target.checked)}/> Pedido mixto · varios productos</label>}
 {external?<p>Cajas ajenas · sin producto ni conteo.</p>:mixed?<p>Asigna los productos al revisar el packing. Cada caja se contará una sola vez.</p>:<div className="receivingProductPicker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false)}}>
 <label className="receivingField">Producto<input role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open&&active>=0?`${listId}-${active}`:undefined} required={!isForeign} placeholder="Buscar producto…" value={search} autoComplete="off" onFocus={()=>setOpen(true)} onChange={e=>{setSearch(e.target.value);setSelectedProduct('');setActive(-1);setOpen(true)}} onKeyDown={e=>{
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>matches.length?(e.key==='ArrowDown'?Math.min(i+1,matches.length-1):Math.max(i-1,0)):-1)}
 else if(e.key==='Enter'&&open){e.preventDefault();if(active>=0&&matches[active])choose(matches[active]);else if(matches.length===1)choose(matches[0])}
 else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setActive(-1)}
 }}/></label><input type="hidden" name="product" value={selectedProduct}/>
 {open&&<div className="receivingProductOptions" id={listId} role="listbox" aria-label="Productos">{matches.length?matches.map((p,i)=><div id={`${listId}-${i}`} key={p.id} role="option" aria-selected={p.id===selectedProduct} className={i===active?'active':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(p)}>{p.name}{p.id===selectedProduct&&<span aria-hidden="true">✓</span>}</div>):<div className="receivingProductEmpty" role="status">Sin resultados</div>}</div>}
 </div>}
 <label className="receivingField">Transporte<select name="shipping" required defaultValue=""><option value="" disabled>Selecciona…</option><option value="SEA">SEA · Mar</option><option value="AIR">AIR · Aire</option></select></label>
 {!external&&<>
 <label className="receivingField">Proveedor (opcional)<input name="supplier" maxLength={160} placeholder="Ej. LISA"/></label>
 <label className="receivingField">¿De quién son?<select value={isForeign?'foreign':'own'} onChange={e=>setIsForeign(e.target.value==='foreign')}><option value="own">De esta sucursal</option><option value="foreign">Ajenas · solo registro</option></select></label>
 </>}
 <div className="receivingFieldRow"><label className="receivingField">Cajas del pedido<input name="total" type="number" min={1} max={1000} step={1} required placeholder="20" value={total} onChange={e=>{const value=e.target.value;setTotal(value);const n=Number(value);selectBoxes(Number.isInteger(n)&&n>0&&n<=1000?Array.from({length:n},(_,i)=>String(i+1)):[])}}/><small>El 20 de “1/20”.</small></label><label className="receivingField">Llegaron hoy<input name="received" type="number" readOnly value={arrived.length}/></label></div>
 {validTotal>0&&<section aria-label="Seleccionar cajas recibidas"><h3>¿Cuáles cajas llegaron?</h3><p>Toca las cajas que llegaron.</p><div className="actions"><button type="button" disabled={busy} onClick={()=>selectBoxes(Array.from({length:validTotal},(_,i)=>String(i+1)))}>Seleccionar todas</button><button type="button" disabled={busy} onClick={()=>selectBoxes([])}>Quitar todas</button></div><div className="receivingArrivalGrid">{Array.from({length:validTotal},(_,i)=>String(i+1)).map(n=><button type="button" key={n} aria-label={`Caja ${n}`} aria-pressed={arrived.includes(n)} disabled={busy} onClick={()=>selectBoxes(arrived.includes(n)?arrived.filter(v=>v!==n):[...arrived,n].sort((a,b)=>Number(a)-Number(b)))}><span aria-hidden="true">📦</span>{n}{arrived.includes(n)&&<span aria-hidden="true">✓</span>}</button>)}</div><p role="status">{arrived.length} recibidas · {validTotal-arrived.length} pendientes</p></section>}
 <details><summary>Referencia del proveedor (opcional)</summary><label className="receivingField">Referencia<input name="reference" maxLength={160}/></label></details>
 {error&&<p className="receivingError" role="alert">{error}</p>}<button className="receivingSave" disabled={busy}>{busy?'Guardando…':'Guardar pedido'}</button>
 </fieldset></form>;
}
export function ExistingArrival({batch,boxes,busy,save}:{batch:Batch;boxes:PendingCarton[];busy:boolean;save:Save}){
 const [error,setError]=useState(''),[selected,setSelected]=useState<string[]>([]);
 const selectedIds=boxes.filter(b=>selected.includes(b.id)).map(b=>b.id);
 return <form className="receivingCompactForm" onSubmit={async e=>{e.preventDefault();setError('');if(busy)return;if(!selectedIds.length){setError('Selecciona las cajas que llegaron.');return}try{if(await save({action:'arrive',boxIds:selectedIds}))setSelected([]);}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la llegada.');}}}>
 <fieldset disabled={busy}><p><b>{batch.product}</b> · {boxes.length} cajas pendientes</p><h3>¿Cuáles cajas llegaron?</h3>
 <div className="actions"><button type="button" disabled={busy||!boxes.length} onClick={()=>setSelected(boxes.map(b=>b.id))}>Seleccionar todas</button><button type="button" disabled={busy||!selectedIds.length} onClick={()=>setSelected([])}>Quitar todas</button></div>
 <div className="receivingArrivalGrid" aria-label="Cajas pendientes">{boxes.map(b=><button type="button" key={b.id} aria-label={`Caja ${b.carton_number}`} aria-pressed={selectedIds.includes(b.id)} disabled={busy} onClick={()=>setSelected(v=>v.includes(b.id)?v.filter(id=>id!==b.id):[...v,b.id])}><span aria-hidden="true">📦</span>{b.carton_number}{selectedIds.includes(b.id)&&<span aria-hidden="true">✓</span>}</button>)}</div>
 <p role="status">{selectedIds.length} recibidas · {boxes.length-selectedIds.length} seguirán pendientes</p>
 {error&&<p role="alert" className="receivingError">{error}</p>}<button type="submit" className="receivingSave" disabled={busy||!selectedIds.length}>Registrar llegada</button></fieldset></form>;
}
