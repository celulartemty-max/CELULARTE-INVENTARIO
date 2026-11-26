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
 const [catalogSearch,setCatalogSearch]=useState<Record<string,string>>({});
 const [editingBranch,setEditingBranch]=useState<'Treviño'|'Plaza del Audio'|null>(null);
 const [branchSaving,setBranchSaving]=useState(false);
 const [plaza,setPlaza]=useState<Record<string,number>>({});
 const [mapping,setMapping]=useState<Record<string,string>>({});
 const [catalog,setCatalog]=useState<{id:string;name:string}[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [exits,setExits]=useState<{movement_id:string;branch:string;status:string}[]>([]);
 const [closing,setClosing]=useState(false);
 useEffect(()=>{let active=true;Promise.all([
  fetch('/api/tiktok-labels/orders',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('No se pudo consultar el pedido.');return response.json() as Promise<Order[]>}),
  fetch('/api/tiktok-labels/inventory-products',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo cargar el catálogo.');return data as {id:string;name:string}[];}),
  fetch('/api/tiktok-labels/preparation?orderId='+encodeURIComponent(orderId),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la preparación.');return data as {plaza:Record<string,number>;trevino?:Record<string,number>;products?:Record<string,string>;source_updated_at?:string|null;exits?:{movement_id:string;branch:string;status:string}[]};})
 ]).then(([data,products,preparation])=>{
  if(!active)return;
  const ordered=[...data].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const index=ordered.findIndex(item=>item.id===orderId);
  if(index<0)throw Error('Pedido no encontrado.');
  setOrder(ordered[index]);setNumber('TT-'+String(index+1).padStart(4,'0'));
  setPlaza(preparation.plaza||{});setTrevino(preparation.trevino||{});setMapping(preparation.products||{});setCatalog(products);setExits(preparation.exits||[]);
 }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};
 },[orderId]);
 const totals=new Map<string,number>();
 for(const item of order?.items||[]){
  const product=String(item.product_name||'Producto sin nombre').trim();
  totals.set(product,(totals.get(product)||0)+(Number(item.qty)||0));
 }
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const pieces=[...totals.values()].reduce((a,b)=>a+b,0);
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

 async function closeOrder(){if(closing||editingBranch||!order)return;if(!window.confirm('¿Cerrar pedido y generar las salidas de las aportaciones guardadas?'))return;setClosing(true);setError('');try{const r=await fetch('/api/tiktok-labels/preparation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',orderId})});const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo cerrar');setExits(d.exits);setNotice('Pedido cerrado. Pendiente de registro en sistema.');}catch(e){setError(e instanceof Error?e.message:'Error al cerrar');}finally{setClosing(false);}}
 const complete=pieces>0&&[...totals].every(([name,total])=>(trevino[name]??0)+(plaza[name]??0)===total&&(!total||mapping[name]));
 const registered=exits.length>0&&exits.every(e=>['POS_REGISTERED','POS_RECONCILED'].includes(e.status));
 return <div className="fullWorkspace fullOrderDetail">
  <Link className="fullListBack" href="/salidas/pedidos/tiktok">← Pedidos TikTok</Link>
  {loading&&<p>Cargando pedido…</p>}
  {error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}
  {order&&<>
   <header className="fullOrderHeading"><small>{number}</small><h1>{order.name}</h1><span className="fullOrderBadge">{registered?"Registrado en sistema":exits.length?"Pendiente de registro":"Pendiente"}</span></header>
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
      <div className="fullOrderBranchAction"><small>{total>0?'Aportación registrada':'Pendiente'}</small><button disabled={exits.length>0||closing} className="fullQuantityButton" type="button" onClick={()=>{setEditingBranch(isEditing?null:branch)}}>{isEditing?'Cerrar':'Modificar cantidad'}</button></div>
      {isEditing&&<div style={{marginTop:18,display:'grid',gap:12}}>
       {[...totals].map(([name,max])=><div key={name} style={{display:'grid',gap:10,padding:14,border:'1px solid #e2e8f0',borderRadius:12}}>
        <strong>{name} <small style={{color:'#64748b',fontWeight:400}}>Máximo {max}</small></strong>
        <div style={{display:'grid',gap:6}}>
         <label htmlFor={'catalog-'+name} style={{fontWeight:600}}>Producto de COREONE</label>
         <input id={'catalog-'+name} type="search" placeholder="Buscar producto del catálogo…" value={catalogSearch[name]??catalog.find(p=>p.id===mapping[name])?.name??''} onChange={e=>{setCatalogSearch(prev=>({...prev,[name]:e.target.value}));setMapping(prev=>({...prev,[name]:''}));setNotice('')}} style={{width:'100%',padding:11,border:'1px solid #cbd5e1',borderRadius:9}}/>
         {mapping[name]&&<small style={{color:'#166534'}}>✓ Producto seleccionado</small>}
         {!mapping[name]&&(catalogSearch[name]??'').trim()&&<div style={{maxHeight:200,overflowY:'auto',border:'1px solid #cbd5e1',borderRadius:9}}>{catalog.filter(p=>normalize(p.name).includes(normalize(catalogSearch[name]??''))).slice(0,15).map(p=><button type="button" key={p.id} onClick={()=>{setMapping(prev=>({...prev,[name]:p.id}));setCatalogSearch(prev=>({...prev,[name]:p.name}));setNotice('')}} style={{display:'block',width:'100%',textAlign:'left',padding:11,background:'#fff',border:0,borderBottom:'1px solid #e2e8f0',color:'#172b4d'}}>{p.name}</button>)}</div>}
        </div>
        <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>Piezas
         <input type="number" min={0} max={max} step={1} value={quantities[name]??0} onChange={e=>setQuantities(prev=>({...prev,[name]:e.target.value===''?0:Number(e.target.value)}))} style={{width:110,padding:10,border:'1px solid #cbd5e1',borderRadius:9}}/>
        </label>
       </div>)}
       {!validBranch&&<p role="alert" style={{color:'#b42318'}}>Revisa las cantidades.</p>}
       <button type="button" disabled={!validBranch||branchSaving||[...totals].some(([name])=>(quantities[name]??0)>0&&!mapping[name])} onClick={()=>saveBranch(branch)}>{branchSaving?'Guardando…':'Guardar aportación'}</button>
      </div>}
      {total===0&&!isEditing&&!exits.length&&<button type="button" style={{background:'#f1f1f1',border:0,borderRadius:10,padding:'10px 14px',marginTop:10,fontWeight:700}} onClick={()=>setEditingBranch(branch)}>Sin aportación</button>}
     </section>;
    })}
   </div>
   <div style={{margin:'12px 0',color:pending===0?'#166534':'#9a3412',fontWeight:600}}>{pending===0?'Aportaciones completas':pending>0?'Pendientes de asignar: '+pending+' piezas':'Las aportaciones exceden el pedido por '+Math.abs(pending)+' piezas'}</div>

   {notice&&<p role="status">{notice}</p>}
   {!exits.length&&complete&&!editingBranch&&<button type="button" disabled={closing||branchSaving} onClick={closeOrder} style={{width:'100%',padding:14,background:'#2056b8',color:'#fff',borderRadius:12,border:0,fontWeight:700}}>{closing?'Cerrando…':'Cerrar pedido'}</button>}
   {exits.length>0&&<section className="card fullOrderBranch"><h2>{registered?'Registrado en sistema':'Pendiente de registro en sistema'}</h2>{exits.map(e=><p key={e.movement_id}>{e.branch} · {['POS_REGISTERED','POS_RECONCILED'].includes(e.status)?'Registrado':'Pendiente de registro'}</p>)}<Link href="/movimientos">Ver movimientos</Link></section>}
  </>}
 </div>;
}
