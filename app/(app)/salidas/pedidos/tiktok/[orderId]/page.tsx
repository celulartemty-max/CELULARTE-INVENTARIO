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
 const [plaza,setPlaza]=useState<Record<string,number>>({});
 const [mapping,setMapping]=useState<Record<string,string>>({});
 const [catalog,setCatalog]=useState<{id:string;name:string}[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let active=true;Promise.all([
  fetch('/api/tiktok-labels/orders',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('No se pudo consultar el pedido.');return response.json() as Promise<Order[]>}),
  fetch('/api/tiktok-labels/inventory-products',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo cargar el catálogo.');return data as {id:string;name:string}[];}),
  fetch('/api/tiktok-labels/preparation?orderId='+encodeURIComponent(orderId),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la preparación.');return data as {plaza:Record<string,number>;products?:Record<string,string>};})
 ]).then(([data,products,preparation])=>{
  if(!active)return;
  const ordered=[...data].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const index=ordered.findIndex(item=>item.id===orderId);
  if(index<0)throw Error('Pedido no encontrado.');
  setOrder(ordered[index]);setNumber('TT-'+String(index+1).padStart(4,'0'));
  setPlaza(preparation.plaza||{});setMapping(preparation.products||{});setCatalog(products);
 }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};
 },[orderId]);
 const totals=new Map<string,number>();
 for(const item of order?.items||[]){
  const product=String(item.product_name||'Producto sin nombre').trim();
  totals.set(product,(totals.get(product)||0)+(Number(item.qty)||0));
 }
 const pieces=[...totals.values()].reduce((a,b)=>a+b,0);
 const validMapping=[...totals.keys()].every(name=>!!mapping[name]);
 const valid=[...totals].every(([name,total])=>Number.isSafeInteger(plaza[name]??0)&&(plaza[name]??0)>=0&&(plaza[name]??0)<=total);
 const plazaTotal=[...totals].reduce((n,[name])=>n+(plaza[name]??0),0);
 async function save(){
  if(!valid||!validMapping||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/tiktok-labels/preparation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,plaza:Object.fromEntries([...totals].map(([name])=>[name,plaza[name]??0])),products:Object.fromEntries([...totals.keys()].map(name=>[name,mapping[name]]))})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'No se pudo guardar.');
   setNotice('Preparación guardada. Aún no se ha descontado inventario.');
  }catch(e){setError(e instanceof Error?e.message:'Error al guardar');}
  finally{setSaving(false);}
 }
 return <div className="fullWorkspace fullOrderList">
  <Link className="fullListBack" href="/salidas/pedidos/tiktok">← Pedidos TikTok</Link>
  {loading&&<p>Cargando pedido…</p>}
  {error&&<p role="alert" style={{color:'#b42318'}}>{error}</p>}
  {order&&<>
   <header className="fullOrderHeading"><small>{number}</small><h1>{order.name}</h1><span className="fullOrderBadge">Pendiente</span></header>
   <section className="fullOrderTotal"><strong>{pieces.toLocaleString('es-MX')} <span>piezas</span></strong></section>
   <div className="fullOrderBranches">
    <section className="card fullOrderBranch"><div className="fullOrderBranchTop"><h2>Plaza del Audio</h2><strong>{plazaTotal.toLocaleString('es-MX')} <span>pzas</span></strong></div><small>En preparación</small></section>
    <section className="card fullOrderBranch"><div className="fullOrderBranchTop"><h2>Treviño</h2><strong>{(pieces-plazaTotal).toLocaleString('es-MX')} <span>pzas</span></strong></div><small>Calculado por diferencia</small></section>
   </div>
   <section className="card fullOrderBranch">
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
    <button type="button" onClick={save} disabled={!valid||!validMapping||saving}>{saving?'Guardando…':'Guardar preparación'}</button>
    {notice&&<p role="status">{notice}</p>}
    <small>Guardar preparación no genera movimientos ni descuenta inventario. Las salidas se confirmarán por separado.</small>
   </section>
  </>}
 </div>;
}
