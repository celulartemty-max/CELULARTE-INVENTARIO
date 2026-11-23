'use client';
import '../../../full-orders.css';
import '../../compact-list.css';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type OrderItem={id:string;product_id?:string|null;product_name:string;variation:string;qty:number};
type Order={id:string;name:string;items:OrderItem[];created_at:string;updated_at:string};
export default function TikTokOrderDetail(){
 const {orderId}=useParams<{orderId:string}>();
 const [order,setOrder]=useState<Order|null>(null);
 const [number,setNumber]=useState('');
 const [trevino,setTrevino]=useState<Record<string,number>>({});
 const [branchSearch,setBranchSearch]=useState('');
 const [catalogSearch,setCatalogSearch]=useState<Record<string,string>>({});
 const [editingBranch,setEditingBranch]=useState<'Treviño'|'Plaza del Audio'|null>(null);
 const [branchSaving,setBranchSaving]=useState(false);
 const [plaza,setPlaza]=useState<Record<string,number>>({});
 const [request,setRequest]=useState<Record<string,number>>({});
 const [search,setSearch]=useState('');
 const [showMatches,setShowMatches]=useState(false);
 const [sourceChanged,setSourceChanged]=useState(false);
 const [mapping,setMapping]=useState<Record<string,string>>({});
 const [catalog,setCatalog]=useState<{id:string;name:string}[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let active=true;Promise.all([
  fetch('/api/tiktok-labels/orders',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('No se pudo consultar el pedido.');return response.json() as Promise<Order[]>}),
  fetch('/api/tiktok-labels/inventory-products',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo cargar el catálogo.');return data as {id:string;name:string}[];}),
  fetch('/api/tiktok-labels/preparation?orderId='+encodeURIComponent(orderId),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la preparación.');return data as {plaza:Record<string,number>;trevino?:Record<string,number>;products?:Record<string,string>;request?:Record<string,number>;source_updated_at?:string|null};})
 ]).then(([data,products,preparation])=>{
  if(!active)return;
  const ordered=[...data].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const index=ordered.findIndex(item=>item.id===orderId);
  if(index<0)throw Error('Pedido no encontrado.');
  setOrder(ordered[index]);setNumber('TT-'+String(index+1).padStart(4,'0'));
  setPlaza(preparation.plaza||{});setTrevino(preparation.trevino||{});setRequest(preparation.request||{});setSourceChanged(Boolean(preparation.source_updated_at&&new Date(preparation.source_updated_at).getTime()!==new Date(ordered[index].updated_at).getTime()));setMapping(preparation.products||{});setCatalog(products);
 }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};
 },[orderId]);
 const totals=new Map<string,number>();
 for(const item of order?.items||[]){
  const product=String(item.product_name||'Producto sin nombre').trim();
  totals.set(product,(totals.get(product)||0)+(Number(item.qty)||0));
 }
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const selected=(order?.items||[]).filter(item=>(request[item.id]??0)>0);
 const terms=normalize(search.trim()).split(/\s+/).filter(Boolean);
 const matches=terms.length?(order?.items||[]).filter(item=>terms.every(term=>normalize(item.product_name+' '+item.variation).includes(term))).slice(0,12):[];
 const requestedTotal=selected.reduce((sum,item)=>sum+(request[item.id]??0),0);
 const pieces=[...totals.values()].reduce((a,b)=>a+b,0);
 const validRequest=(order?.items||[]).every(item=>Number.isSafeInteger(request[item.id]??0)&&(request[item.id]??0)>=0&&(request[item.id]??0)<=item.qty);
 const validMapping=[...totals.keys()].every(name=>!!mapping[name]);
 const valid=[...totals].every(([name,total])=>Number.isSafeInteger(plaza[name]??0)&&(plaza[name]??0)>=0&&(plaza[name]??0)<=total);
 const plazaTotal=[...totals].reduce((n,[name])=>n+(plaza[name]??0),0);
 const trevinoTotal=[...totals].reduce((n,[name])=>n+(trevino[name]??0),0);
 const pending=pieces-plazaTotal-trevinoTotal;
 async function saveBranch(branch:'Treviño'|'Plaza del Audio'){
  if(branchSaving||!order)return;
  setBranchSaving(true);setError('');setNotice('');
  try{const quantities=branch==='Treviño'?trevino:plaza;
   const products=Object.fromEntries([...totals.keys()].filter(name=>mapping[name]).map(name=>[name,mapping[name]]));
   const response=await fetch('/api/tiktok-labels/preparation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'branch',orderId,branch,quantities,products,sourceUpdatedAt:order.updated_at})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo guardar la aportación.');
   setEditingBranch(null);setNotice('Aportación de '+branch+' guardada. Aún no se ha descontado inventario.');
  }catch(e){setError(e instanceof Error?e.message:'Error al guardar');}finally{setBranchSaving(false);}
 }

 async function save(){
  if(!valid||!validMapping||!validRequest||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/tiktok-labels/preparation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,plaza:Object.fromEntries([...totals].map(([name])=>[name,plaza[name]??0])),products:Object.fromEntries([...totals.keys()].map(name=>[name,mapping[name]])),request,sourceUpdatedAt:order!.updated_at})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'No se pudo guardar.');
   setNotice('Preparación guardada. Aún no se ha descontado inventario.');
  }catch(e){setError(e instanceof Error?e.message:'Error al guardar');}
  finally{setSaving(false);}
 }
 return <div className="fullWorkspace fullOrderDetail">
  <Link className="fullListBack" href="/salidas/pedidos/tiktok">← Pedidos TikTok</Link>
  {loading&&<p>Cargando pedido…</p>}
  {error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}
  {order&&<>
   <header className="fullOrderHeading"><small>{number}</small><h1>{order.name}</h1><span className="fullOrderBadge">Pendiente</span></header>
   <section className="fullOrderTotal"><strong>{pieces.toLocaleString('es-MX')} <span>piezas</span></strong></section>
   <div className="fullOrderBranches">
    {(['Treviño','Plaza del Audio'] as const).map(branch=>{
     const isTrevino=branch==='Treviño';
     const quantities=isTrevino?trevino:plaza;
     const total=isTrevino?trevinoTotal:plazaTotal;
     const setQuantities=isTrevino?setTrevino:setPlaza;
     const isEditing=editingBranch===branch;
     const validBranch=[...totals].every(([name,max])=>Number.isSafeInteger(quantities[name]??0)&&(quantities[name]??0)>=0&&(quantities[name]??0)<=max);
     return <section key={branch} className="card fullOrderBranch">
      <div className="fullOrderBranchTop"><h2>{branch}</h2><strong>{total.toLocaleString('es-MX')} <span>pzas</span></strong></div>
      <div className="fullOrderBranchAction"><small>{total>0?'Aportación registrada':'Pendiente'}</small><button className="fullQuantityButton" type="button" onClick={()=>{setEditingBranch(isEditing?null:branch);setBranchSearch('')}}>{isEditing?'Cerrar':'Modificar cantidad'}</button></div>
      {isEditing&&<div style={{marginTop:18,display:'grid',gap:12}}>
       <label style={{display:'grid',gap:6,fontWeight:600}}>Buscar producto del pedido<input type="search" placeholder="Buscar producto…" value={branchSearch} onChange={e=>setBranchSearch(e.target.value)} style={{width:'100%',padding:12,border:'1px solid #cbd5e1',borderRadius:9}}/></label>
       {[...totals].filter(([name])=>normalize(name).includes(normalize(branchSearch.trim()))).map(([name,max])=><div key={name} style={{display:'grid',gap:10,padding:14,border:'1px solid #e2e8f0',borderRadius:12}}>
        <strong>{name} <small style={{color:'#64748b',fontWeight:400}}>Máximo {max}</small></strong>
        <label style={{display:'grid',gap:6}}>Producto de nuestro catálogo
         <input type="search" placeholder="Buscar en productos guardados…" value={catalogSearch[name]??''} onChange={e=>setCatalogSearch(prev=>({...prev,[name]:e.target.value}))} style={{width:'100%',padding:11,border:'1px solid #cbd5e1',borderRadius:9}}/>
         <select value={mapping[name]||''} onChange={e=>{setMapping(prev=>({...prev,[name]:e.target.value}));setNotice('')}} style={{width:'100%',padding:11,border:'1px solid #cbd5e1',borderRadius:9}}>
          <option value="">Selecciona producto guardado…</option>{catalog.filter(p=>p.id===mapping[name]||normalize(p.name).includes(normalize(catalogSearch[name]??''))).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
         </select>
        </label>
        <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>Piezas
         <input type="number" min={0} max={max} step={1} value={quantities[name]??0} onChange={e=>setQuantities(prev=>({...prev,[name]:e.target.value===''?0:Number(e.target.value)}))} style={{width:110,padding:10,border:'1px solid #cbd5e1',borderRadius:9}}/>
        </label>
       </div>)}
       {!validBranch&&<p role="alert" style={{color:'#b42318'}}>Revisa las cantidades.</p>}
       <button type="button" disabled={!validBranch||branchSaving||[...totals].some(([name])=>(quantities[name]??0)>0&&!mapping[name])} onClick={()=>saveBranch(branch)}>{branchSaving?'Guardando…':'Guardar aportación'}</button>
      </div>}
      {total===0&&!isEditing&&<button type="button" style={{background:'#f1f1f1',border:0,borderRadius:10,padding:'10px 14px',marginTop:10,fontWeight:700}} onClick={()=>setEditingBranch(branch)}>Sin aportación</button>}
     </section>;
    })}
   </div>
   <div style={{margin:'12px 0',color:pending===0?'#166534':'#9a3412',fontWeight:600}}>{pending===0?'Aportaciones completas':pending>0?'Pendientes de asignar: '+pending+' piezas':'Las aportaciones exceden el pedido por '+Math.abs(pending)+' piezas'}</div>
   <section className="card fullOrderBranch">
    <div className="fullOrderBranchTop"><h2>Solicitud de Treviño a Plaza</h2><strong>{requestedTotal.toLocaleString('es-MX')} <span>pzas</span></strong></div>
    <p style={{color:'#64748b',marginTop:8}}>Busca por modelo o color. Solo aparecen variantes del pedido original de TikTok.</p>
    {sourceChanged&&<p role="alert" style={{color:'#b42318'}}>El pedido original cambió. Revisa tu solicitud antes de guardarla.</p>}
    <div style={{position:'relative',margin:'20px 0'}}>
     <label htmlFor="tiktokVariantSearch" style={{fontWeight:700,display:'block',marginBottom:8}}>Buscar variante</label>
     <input id="tiktokVariantSearch" type="search" autoComplete="off" placeholder="Ej. iPhone 15 Pro, multicolor, negro…" value={search} onFocus={()=>setShowMatches(true)} onChange={e=>{setSearch(e.target.value);setShowMatches(true);}} style={{width:'100%',padding:'14px 16px',border:'1px solid #cbd5e1',borderRadius:12,fontSize:16}}/>
     {showMatches&&terms.length>0&&<div style={{border:'1px solid #e2e8f0',borderRadius:12,marginTop:6,maxHeight:350,overflowY:'auto',background:'#fff',boxShadow:'0 8px 24px rgba(15,23,42,.08)'}}>
      {matches.length===0?<p style={{padding:14}}>No hay variantes coincidentes en este pedido. Para agregar una, modifica Etiquetas TikTok.</p>:matches.map(item=><button type="button" key={item.id} onClick={()=>{setRequest(prev=>({...prev,[item.id]:Math.max(1,prev[item.id]??0)}));setSearch('');setShowMatches(false);setNotice('');}} disabled={(request[item.id]??0)>0} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,width:'100%',padding:'13px 16px',border:0,borderBottom:'1px solid #f1f5f9',background:'#fff',textAlign:'left',cursor:'pointer'}}>
       <span><strong>{item.variation||item.product_name}</strong><small style={{display:'block',color:'#64748b'}}>{item.product_name}</small></span><span style={{whiteSpace:'nowrap',color:'#334155'}}>{(request[item.id]??0)>0?'Agregada':item.qty+' disponibles  +'}</span>
      </button>)}
     </div>}
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,margin:'18px 0 10px'}}><h3 style={{margin:0}}>Variantes solicitadas</h3><small>{selected.length} variantes</small></div>
    {selected.length===0?<div style={{padding:'28px 18px',border:'1px dashed #cbd5e1',borderRadius:12,textAlign:'center',color:'#64748b'}}>Busca un modelo o color para agregarlo a la solicitud.</div>:<div style={{display:'grid',gap:10}}>
     {selected.map(item=><div key={item.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:14,border:'1px solid #e2e8f0',borderRadius:12,background:'#f8fafc'}}>
      <div style={{flex:'1 1 220px'}}><strong>{item.variation||item.product_name}</strong><small style={{display:'block',color:'#64748b'}}>{item.product_name} · Máximo {item.qty}</small></div>
      <label style={{display:'flex',alignItems:'center',gap:8,fontWeight:600}}>Piezas <input aria-label={'Cantidad de '+(item.variation||item.product_name)} type="number" min={0} max={item.qty} step={1} value={request[item.id]??0} onChange={e=>{setRequest(prev=>({...prev,[item.id]:e.target.value===''?0:Number(e.target.value)}));setNotice('');}} style={{width:90,padding:10,border:'1px solid #cbd5e1',borderRadius:9}}/></label>
      <button type="button" aria-label={'Quitar '+(item.variation||item.product_name)} onClick={()=>setRequest(prev=>{const next={...prev};delete next[item.id];return next;})} style={{border:'1px solid #e2e8f0',borderRadius:9,padding:'9px 12px',background:'#fff',cursor:'pointer'}}>Quitar</button>
     </div>)}
    </div>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'20px 0',padding:'16px 0',borderTop:'1px solid #e2e8f0'}}><strong>Total solicitado a Plaza</strong><strong style={{fontSize:24,color:'#1e3a5f'}}>{requestedTotal.toLocaleString('es-MX')} pzas</strong></div>
    {!validRequest&&<p role="alert" style={{color:'#b42318'}}>Las cantidades deben ser enteras y no superar el total de cada variante.</p>}
    <hr style={{border:0,borderTop:'1px solid #e2e8f0',margin:'24px 0'}}/>
    <h2>Total del pedido TikTok</h2>
    <p>Selecciona el producto real del inventario. El título de TikTok solo identifica el artículo.</p>
    {[...totals].map(([product,qty])=><div key={product} className="formGrid" style={{padding:'16px 0',borderBottom:'1px solid #dbe3ef'}}>
     <strong>{product}</strong>
     <label>Producto de inventario
      <select required value={mapping[product]||''} onChange={e=>{setMapping(prev=>({...prev,[product]:e.target.value}));setNotice('');}}>
       <option value="">Selecciona…</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
     </label>
     <div><b>Total: {qty.toLocaleString('es-MX')} unidades</b></div>
     <label>Plaza del Audio
      <input type="number" min={0} max={qty} step={1} value={plaza[product]??0} onChange={e=>{setPlaza(prev=>({...prev,[product]:e.target.value===''?0:Number(e.target.value)}));setNotice('');}}/>
     </label>
     <div className="fullCountPreview"><strong>Treviño: {(qty-(plaza[product]??0)).toLocaleString('es-MX')} unidades</strong></div>
    </div>)}
    {!valid&&<p role="alert">Las cantidades deben ser enteras entre cero y el total del producto.</p>}
    {!validMapping&&<p>Selecciona un producto del catálogo para poder guardar.</p>}
    <button type="button" onClick={save} disabled={!valid||!validMapping||!validRequest||saving}>{saving?'Guardando…':'Guardar preparación'}</button>
    {notice&&<p role="status">{notice}</p>}
    <small>Guardar preparación no genera movimientos ni descuenta inventario. Las salidas se confirmarán por separado.</small>
   </section>
  </>}
 </div>;
}
