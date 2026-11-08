import '../../full-orders.css';
import Link from 'next/link';
import EditName from './edit-name';
import { requireUser } from '@/lib/auth/authorization';
import { fullOrderRows,fullOrderProducts,fullOrderStatus } from '@/lib/inventory/full-orders';
export default async function Page({params}:{params:Promise<{orderId:string}>}){
 const user=await requireUser(),{orderId}=await params,rows=await fullOrderRows(user,orderId);
 if(!rows.length)return <p>Pedido no disponible para tus sucursales.</p>;
 const products=await fullOrderProducts(user,orderId),order=rows[0],total=rows.reduce((n,r)=>n+(r.status==='CANCELLED'?0:r.pieces),0);
 const expected=order.expected_pieces,difference=expected===null?null:total-expected;
 return <div className="fullWorkspace fullOrderDetail">
  <Link href="/salidas/pedidos">← Pedidos</Link>
  <header className="fullOrderHeading"><small>FULL #{order.reference}</small><h1>{order.title}</h1>{user.role==='MASTER'&&<EditName id={orderId} title={order.title}/>}<span className="fullOrderBadge">{fullOrderStatus(rows)}</span></header>
  {user.role==='MASTER'&&<section className="fullOrderTotal" aria-label="Total del pedido"><strong>{total.toLocaleString('es-MX')}{expected!==null?` / ${expected.toLocaleString('es-MX')}`:''} <span>piezas</span></strong>{difference!==null&&<small>{difference===0?'✓ Total completo':difference<0?`Faltan ${(-difference).toLocaleString('es-MX')}`:`${difference.toLocaleString('es-MX')} de más`}</small>}</section>}
  <div className="fullOrderBranches">{rows.map(r=><section className="card fullOrderBranch" key={r.movement_id}>
   <div className="fullOrderBranchTop"><h2>{r.branch}</h2><strong>{r.pieces.toLocaleString('es-MX')} <span>pzas</span></strong></div>
   <div className="fullOrderBranchAction"><small>{fullOrderStatus([r])}</small><Link href={'/salidas/'+r.movement_id}>Abrir salida →</Link></div>
  </section>)}</div>
  <details className="fullOrderDetails"><summary>Ver detalles</summary>
   {rows.map(r=><div key={r.movement_id}><p><b>{r.branch}</b><br/><small>Folio: {r.folio}</small></p>{r.pos_registered_at&&<small>Registró {r.registered_by||'Usuario'} · {new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(r.pos_registered_at))}</small>}</div>)}
   {products.length>0&&<><h3>Productos por sucursal</h3>{products.map((p,i)=><p key={i}><b>{p.product}</b> · {p.branch}: {p.quantity.toLocaleString('es-MX')} piezas</p>)}</>}
   {user.role==='MASTER'&&<small>Captura manual; no hay sincronización automática con Mercado Libre.</small>}
  </details>
 </div>;
}
