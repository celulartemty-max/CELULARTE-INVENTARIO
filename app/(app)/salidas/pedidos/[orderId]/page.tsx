import '../../full-orders.css';
import './final-count.css';
import Link from 'next/link';
import InlineQuantity from './inline-quantity';
import {sql} from '@/lib/db';
import EditName from './edit-name';
import FinalCount from './final-count';
import RegistrationQueue from '../../../registros/registration-queue';
import {finalCountView,finalAdjustment} from '@/lib/inventory/full-final-count';
import {registrationPending} from '@/lib/inventory/system-registration';
import {fullReviewData} from '@/lib/inventory/full-review';
import {AdjustTarget,ShippingAction} from '../workflow-controls';
import { requireUser,getAuthorizedBranchIds,hasModulePermission } from '@/lib/auth/authorization';
import { fullOrderRows,fullOrderProducts,fullOrderStatus } from '@/lib/inventory/full-orders';
export default async function Page({params}:{params:Promise<{orderId:string}>}){
 const user=await requireUser(),{orderId}=await params,rows=await fullOrderRows(user,orderId);
 if(!rows.length)return <p>Pedido no disponible para tus sucursales.</p>;
 const [products,final,review,allowed,canRegister]=await Promise.all([fullOrderProducts(user,orderId),finalCountView(user,orderId),fullReviewData(user,orderId),getAuthorizedBranchIds(user),hasModulePermission(user,'REGISTRO_SISTEMA')]);
 const editableIds=rows.filter(r=>!r.shipped_at&&!r.waived_at&&!r.pos_registered_at&&['DRAFT','CLOSED','PENDING_POS'].includes(r.status)&&(allowed===null||allowed.includes(r.branch_id))).map(r=>r.movement_id);
 const editableLines=editableIds.length?await sql`SELECT l.id::text,l.movement_id::text,l.product_id::text,p.name product,l.quantity::int FROM exit_lines l JOIN products p ON p.id=l.product_id WHERE l.movement_id=ANY(${editableIds}::uuid[]) AND NOT EXISTS(SELECT 1 FROM full_exit_reviews v WHERE v.movement_id=l.movement_id) ORDER BY p.name,l.id`:[];
 const order=rows[0],total=final?.total??rows.reduce((n,r)=>n+(r.status==='CANCELLED'?0:r.pieces),0);
 const expected=order.expected_pieces,difference=expected===null?null:total-expected;
 const pending=canRegister?(await registrationPending(user)).filter(r=>r.kind==='FULL_ADJUSTMENT'&&r.id===orderId):[];
 const plaza=new Map<string,number>();for(const l of review.lines)if(l.product_id)plaza.set(l.product_id,(plaza.get(l.product_id)??0)+l.quantity);
 const initial=final?.lines.filter(l=>l.final_quantity>0).map(l=>({productId:l.product_id,quantity:l.final_quantity}))??[];
 const legacy=rows.some(r=>r.branch==='Treviño'&&(r.pieces>0||r.pos_registered_at));
 return <div className="fullWorkspace fullOrderDetail">
  <Link href="/salidas/pedidos">← Pedidos</Link>
  <header className="fullOrderHeading"><small>FULL #{order.reference}</small><h1>{order.title}</h1>{user.role==='MASTER'&&<EditName id={orderId} title={order.title}/>}<span className="fullOrderBadge">{fullOrderStatus(rows)}</span></header>
  {user.role==='MASTER'&&<section className="fullOrderTotal" aria-label="Total del pedido"><strong>{total.toLocaleString('es-MX')}{expected!==null?` / ${expected.toLocaleString('es-MX')}`:''} <span>piezas</span></strong>{difference!==null&&<small>{difference===0?'✓ Total completo':difference<0?`Faltan ${(-difference).toLocaleString('es-MX')}`:`${difference.toLocaleString('es-MX')} de más`}</small>}</section>}
  <div className="fullOrderBranches">{rows.filter(r=>!final||r.branch!=='Treviño').map(r=><section className="card fullOrderBranch" key={r.movement_id}>
   <div className="fullOrderBranchTop"><h2>{r.branch}</h2><strong>{r.pieces.toLocaleString('es-MX')} <span>pzas</span></strong></div>
   <div className="fullOrderBranchAction"><small>{r.waived_at?'Sin aportación':r.status==='POS_CORRECTION_PENDING'?'Corrección pendiente':r.pos_registered_at?'Registrado':r.status==='DRAFT'?'Pendiente':'Pendiente de registro'}</small>{(!r.waived_at||!order.shipped_at)&&<Link className="fullQuantityButton" href={'/salidas/'+r.movement_id}>{order.shipped_at||r.pieces>0?'Ver detalle →':'Agregar producto'}</Link>}</div>
   {editableLines.filter(l=>String(l.movement_id)===r.movement_id).map(l=><InlineQuantity key={String(l.id)+':'+String(l.quantity)} movementId={r.movement_id} lineId={String(l.id)} productId={String(l.product_id)} product={String(l.product)} quantity={Number(l.quantity)}/>)}
   {!order.shipped_at&&!r.waived_at&&r.status==='DRAFT'&&r.pieces===0&&(allowed===null||allowed.includes(r.branch_id))&&<ShippingAction orderId={orderId} movementId={r.movement_id}/>}
  </section>)}</div>
  {final&&<section className="card fullOrderBranch"><h2>Ajuste calculado de Treviño</h2>{final.lines.map(l=>{const delta=l.final_quantity-l.plaza_quantity;return <p key={l.product_id}><b>{l.product}</b> · {delta===0?'Sin ajuste':`${delta>0?'Salida':'Entrada'} de ${Math.abs(delta).toLocaleString('es-MX')} piezas`}</p>})}{final.stale?<p role="alert">Cambió Plaza. Guarda de nuevo el conteo final antes de registrar o cerrar.</p>:<><p>{finalAdjustment(final.lines,'origin').length||finalAdjustment(final.lines,'destination').length?'Pendiente de registrar en sistema':'Sin ajustes pendientes de registro'}</p><RegistrationQueue rows={pending} compact buttonLabel="Registrar en sistema"/></>}</section>}
  {!order.shipped_at&&review.canReview&&(legacy?<p>Este pedido conserva una salida anterior de Treviño. No se generará otro ajuste para evitar duplicarlo.</p>:<section className="card fullOrderBranch"><FinalCount key={final?.revision??0} orderId={orderId} revision={final?.revision??0} initial={initial} products={review.products} plaza={[...plaza].map(([productId,quantity])=>({productId,quantity}))}/></section>)}
  {!order.shipped_at&&review.canReview&&<ShippingAction orderId={orderId}/>}
  {order.shipped_at&&<p>Enviado por {order.shipped_by_name||'Usuario'} · {new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(order.shipped_at))}</p>}
  <details className="fullOrderDetails"><summary>Ver detalles</summary>
   {review.summary.sent>0&&<p>Plaza envió {review.summary.sent} · Correctas {review.summary.accepted} · Separadas para devolver {review.summary.rejected}</p>}
   {user.role==='MASTER'&&<AdjustTarget orderId={orderId} expected={expected}/>}
   {rows.map(r=><div key={r.movement_id}><p><b>{r.branch}</b><br/><small>Folio: {r.folio}</small></p>{r.pos_registered_at&&<small>Registró {r.registered_by||'Usuario'} · {new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(r.pos_registered_at))}</small>}</div>)}
   {products.length>0&&<><h3>Productos por sucursal</h3>{products.map((p,i)=><p key={i}><b>{p.product}</b> · {p.branch}: {p.quantity.toLocaleString('es-MX')} piezas</p>)}</>}
   {user.role==='MASTER'&&<small>Captura manual; no hay sincronización automática con Mercado Libre.</small>}
  </details>
 </div>;
}
