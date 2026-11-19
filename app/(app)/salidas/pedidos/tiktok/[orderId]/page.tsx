'use client';
import '../../../full-orders.css';
import '../../compact-list.css';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type OrderItem={id:string;product_id?:string|null;product_name:string;variation:string;qty:number};
type Order={id:string;name:string;items:OrderItem[];created_at:string};
export default function TikTokOrderDetail(){
 const {orderId}=useParams<{orderId:string}>();
 const [order,setOrder]=useState<Order|null>(null);
 const [number,setNumber]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;fetch('/api/tiktok-labels/orders',{cache:'no-store'}).then(async response=>{
  if(!response.ok)throw Error('No se pudo consultar el pedido.');
  return response.json();
 }).then((data:Order[])=>{
  if(!active)return;
  const ordered=[...data].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const index=ordered.findIndex(item=>item.id===orderId);
  if(index<0)throw Error('Pedido no encontrado.');
  setOrder(ordered[index]);setNumber('TT-'+String(index+1).padStart(4,'0'));
 }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};
 },[orderId]);
 const totals=new Map<string,number>();
 for(const item of order?.items||[]){
  const product=String(item.product_name||'Producto sin nombre').trim();
  totals.set(product,(totals.get(product)||0)+(Number(item.qty)||0));
 }
 const pieces=[...totals.values()].reduce((a,b)=>a+b,0);
 return <div className="fullWorkspace fullOrderList">
  <Link className="fullListBack" href="/salidas/pedidos/tiktok">← Pedidos TikTok</Link>
  {loading&&<p>Cargando pedido…</p>}
  {error&&<p role="alert">{error}</p>}
  {order&&<><small>{number}</small><h1>{order.name}</h1>
   <div className="card pad" style={{display:'grid',gap:16}}>
    <div><strong>{pieces.toLocaleString('es-MX')} piezas</strong><p>Destino: Bodega externa TikTok</p></div>
    <h2>Productos del pedido</h2>
    <p>Las cantidades están agrupadas por producto, sin separar modelos ni colores.</p>
    <div className="fullListRows">{[...totals].map(([product,qty])=><div className="fullListRow" key={product}>
     <div className="fullListInfo"><h2>{product}</h2></div>
     <strong className="fullListCount">{qty.toLocaleString('es-MX')} <small>pzas</small></strong>
    </div>)}</div>
    <h2>Distribución entre sucursales</h2>
    <p>Plaza del Audio registrará las piezas que aporta y Treviño se calculará por diferencia. El registro de salidas todavía está en preparación; este resumen no descuenta inventario.</p>
   </div>
  </>}
 </div>;
}
