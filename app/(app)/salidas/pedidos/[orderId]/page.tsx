import '../../full-orders.css';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { fullOrderRows,fullOrderProducts,fullOrderStatus } from '@/lib/inventory/full-orders';
export default async function Page({params}:{params:Promise<{orderId:string}>}){
 const user=await requireUser(),{orderId}=await params,rows=await fullOrderRows(user,orderId);
 if(!rows.length)return <p>Pedido no disponible para tus sucursales.</p>;
 const products=await fullOrderProducts(user,orderId),order=rows[0],total=rows.reduce((n,r)=>n+(r.status==='CANCELLED'?0:r.pieces),0);
 const expected=order.expected_pieces,difference=expected===null?null:total-expected;
 return <div className="fullWorkspace"><Link href="/salidas/pedidos">← Gestión de Pedidos</Link><p>Mercado Libre FULL #{order.reference}</p><h1>{order.title}</h1><p>{fullOrderStatus(rows)}</p>{user.role==='MASTER'&&<section className="card pad"><h2>Consolidado</h2><p>{total.toLocaleString('es-MX')} piezas capturadas{expected!==null?` / ${expected.toLocaleString('es-MX')} en Mercado Libre`:''}</p>{difference!==null&&<p>{difference===0?'✓ El total cuadra con el pedido.':difference<0?`Faltan ${-difference} piezas por capturar.`:`Hay ${difference} piezas de más. Revisa las salidas.`}</p>}<small>Los totales se comparan con lo capturado aquí; no hay sincronización automática con Mercado Libre.</small></section>}
 {rows.map(r=><section className="card pad" key={r.movement_id} style={{marginTop:16}}><h2>{r.branch}</h2><b>{order.title}</b><p>Salida #{r.folio}</p><p>{r.pieces} piezas · {fullOrderStatus([r])}</p>{r.pos_registered_at&&<small>Registro confirmado por {r.registered_by||'Usuario'} · {new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(r.pos_registered_at))}</small>}<p><Link href={'/salidas/'+r.movement_id}>Abrir salida →</Link></p></section>)}
 <section className="card pad" style={{marginTop:16}}><h2>Productos por sucursal</h2>{products.length?products.map((p,i)=><p key={i}><b>{p.product}</b> · {p.branch}: {p.quantity} piezas</p>):<p>Aún no hay productos capturados.</p>}</section></div>;
}
