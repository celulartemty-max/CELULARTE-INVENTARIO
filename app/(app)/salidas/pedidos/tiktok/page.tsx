'use client';
import '../compact-list.css';
import '../../full-orders.css';
import Link from 'next/link';
import {useEffect,useState} from 'react';

type LabelOrder={id:string;name:string;items:{qty:number}[];created_at:string};
export default function TikTokOrdersPage(){
 const [orders,setOrders]=useState<LabelOrder[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [view,setView]=useState<'open'|'history'>('open');
 useEffect(()=>{let active=true;fetch('/api/tiktok-labels/orders',{cache:'no-store'})
  .then(async r=>{if(!r.ok)throw Error('No se pudieron cargar los pedidos de TikTok.');return r.json()})
  .then(data=>{if(active)setOrders(Array.isArray(data)?data:[])})
  .catch(e=>{if(active)setError(e.message)})
  .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[]);
 const ordered=[...orders].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
 const numbers=new Map(ordered.map((order,index)=>[order.id,'TT-'+String(index+1).padStart(4,'0')]));
 return <div className="fullWorkspace fullOrderList">
  <Link className="fullListBack" href="/salidas">← Salidas</Link>
  <h1>Gestión de Pedidos</h1>
  <nav className="fullListTabs" aria-label="Plataforma de pedidos">
   <Link href="/salidas/pedidos">Mercado Libre</Link>
   <Link href="/salidas/pedidos/tiktok" aria-current="page">TikTok</Link>
  </nav>
  <nav className="fullListTabs" aria-label="Estado de los pedidos">
   <button type="button" onClick={()=>setView('open')} aria-current={view==='open'?'page':undefined}>Pendientes</button>
   <button type="button" onClick={()=>setView('history')} aria-current={view==='history'?'page':undefined}>Enviados</button>
  </nav>
  {loading&&<p>Cargando pedidos TikTok…</p>}
  {error&&<p role="alert">{error}</p>}
  {!loading&&!error&&view==='history'&&<p>Los pedidos enviados aparecerán aquí cuando habilitemos el registro de salidas de TikTok.</p>}
  {!loading&&!error&&view==='open'&&!orders.length&&<p>No hay pedidos de etiquetas TikTok todavía.</p>}
  {!loading&&!error&&view==='open'&&<div className="fullListRows">{[...orders].reverse().map(order=>{
   const pieces=(Array.isArray(order.items)?order.items:[]).reduce((n,item)=>n+(Number(item.qty)||0),0);
   return <Link className="fullListRow" href="/etiquetas-tiktok" key={order.id}>
    <div className="fullListInfo"><small>{numbers.get(order.id)}</small><h2>{order.name}</h2><div className="fullListMeta"><span>Pendiente de salida</span><small>Bodega externa TikTok</small></div></div>
    <strong className="fullListCount">{pieces.toLocaleString('es-MX')} <small>pzas</small></strong><span className="fullListArrow" aria-hidden="true">›</span>
   </Link>;
  })}</div>}
 </div>;
}
