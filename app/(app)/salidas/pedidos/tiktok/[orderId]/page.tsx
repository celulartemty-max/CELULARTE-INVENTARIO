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
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 useEffect(()=>{let active=true;Promise.all([
  fetch('/api/tiktok-labels/orders',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('No se pudo consultar el pedido.');return response.json() as Promise<Order[]>}),
  fetch('/api/tiktok-labels/preparation?orderId='+encodeURIComponent(orderId),{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la preparación.');return data as {plaza:Record<string,number>};})
 ]).then(([data,preparation])=>{
  if(!active)return;
  const ordered=[...data].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  const index=ordered.findIndex(item=>item.id===orderId);
  if(index<0)throw Error('Pedido no encontrado.');
  setOrder(ordered[index]);setNumber('TT-'+String(index+1).padStart(4,'0'));
  setPlaza(preparation.plaza||{});
 }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
 return()=>{active=false};
 },[orderId]);
 const totals=new Map<string,number>();
 for(const item of order?.items||[]){
  const product=String(item.product_name||'Producto sin nombre').trim();
  totals.set(product,(totals.get(product)||0)+(Number(item.qty)||0));
 }
 const pieces=[...totals.values()].reduce((a,b)=>a+b,0);
 const valid=[...totals].every(([name,total])=>Number.isSafeInteger(plaza[name]??0)&&(plaza[name]??0)>=0&&(plaza[name]??0)<=total);
 const plazaTotal=[...totals].reduce((n,[name])=>n+(plaza[name]??0),0);
 async function save(){
  if(!valid||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/tiktok-labels/preparation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,plaza:Object.fromEntries([...totals].map(([name])=>[name,plaza[name]??0]))})});
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
  {order&&<><div style={{marginTop:20,color:'#526783',fontWeight:600}}>{number}</div><h1>{order.name}</h1>
   <div className="card pad" style={{display:'grid',gap:20}}>
    <div><strong>{pieces.toLocaleString('es-MX')} unidades</strong><p>Destino: Bodega externa TikTok</p></div>
    <h2>Distribución entre sucursales</h2>
    <p>Captura las unidades que aporta Plaza del Audio. Treviño se calcula automáticamente por diferencia, sin separar modelos ni colores.</p>
    <div style={{overflowX:'auto'}}>
     <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
      <thead><tr><th style={{padding:12}}>Producto</th><th style={{padding:12}}>Pedido</th><th style={{padding:12}}>Plaza del Audio</th><th style={{padding:12}}>Treviño</th></tr></thead>
      <tbody>{[...totals].map(([product,qty])=><tr key={product} style={{borderTop:'1px solid #dbe3ef'}}>
       <td style={{padding:12,fontWeight:600}}>{product}</td><td style={{padding:12}}>{qty}</td>
       <td style={{padding:12}}><input aria-label={'Piezas de Plaza para '+product} type="number" min={0} max={qty} step={1} value={plaza[product]??0} onChange={event=>{const raw=event.target.value;setPlaza(previous=>({...previous,[product]:raw===''?0:Number(raw)}));setNotice('');}} style={{width:100,padding:10,border:'1px solid #bdc9da',borderRadius:8}}/></td>
       <td style={{padding:12,fontWeight:600}}>{qty-(plaza[product]??0)}</td>
      </tr>)}</tbody>
      <tfoot><tr style={{borderTop:'2px solid #dbe3ef',fontWeight:700}}><td style={{padding:12}}>Total</td><td style={{padding:12}}>{pieces}</td><td style={{padding:12}}>{plazaTotal}</td><td style={{padding:12}}>{pieces-plazaTotal}</td></tr></tfoot>
     </table>
    </div>
    {!valid&&<p role="alert" style={{color:'#b42318'}}>Las cantidades de Plaza deben ser números enteros entre 0 y el total del producto.</p>}
    <button type="button" onClick={save} disabled={!valid||saving} style={{padding:14,borderRadius:10,background:'#185abc',color:'white',fontWeight:700,border:0,cursor:'pointer',opacity:!valid||saving?.5:1}}>{saving?'Guardando…':'Guardar preparación'}</button>
    {notice&&<p role="status" style={{color:'#17603c'}}>{notice}</p>}
    <p style={{color:'#526783'}}>Este paso solo guarda la distribución. No genera salidas ni descuenta inventario todavía.</p>
   </div>
  </>}
 </div>;
}
