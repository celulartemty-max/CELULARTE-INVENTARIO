import '../full-orders.css';
import Link from 'next/link';
import {z} from 'zod';
import {requireUser} from '@/lib/auth/authorization';
import {fullReviewQueue,fullReviewData} from '@/lib/inventory/full-review';
import {ReviewShipment,ShippingAction} from '../pedidos/workflow-controls';
export default async function Page({searchParams}:{searchParams:Promise<{order?:string}>}){
 const user=await requireUser(),query=await searchParams,queue=await fullReviewQueue(user);
 if(!query.order)return <div className="fullWorkspace"><Link href="/salidas">← Salidas</Link><h1>Revisar piezas de Plaza</h1>{!queue.length&&<p>Sin revisiones pendientes.</p>}{queue.map(o=><article className="card pad" key={o.id}><small>FULL #{o.reference}</small><h2>{o.title}</h2><Link href={'/salidas/revision-full?order='+o.id}>Revisar →</Link></article>)}</div>;
 const orderId=z.string().uuid().parse(query.order),data=await fullReviewData(user,orderId);
 return <div className="fullWorkspace"><Link href="/salidas/revision-full">← Revisiones</Link><h1>Revisión en Treviño</h1>{!data.shippedAt&&data.shipment&&!data.shipment.reviewed&&data.shipment.status!=='DRAFT'?<ReviewShipment movementId={data.shipment.id} version={data.shipment.current_version} lines={data.lines}/>:<p>{data.shippedAt?'FULL enviado.':'Sin revisión pendiente para este pedido.'}</p>}{data.summary.sent>0&&<p>Enviadas {data.summary.sent} · Correctas {data.summary.accepted} · Por devolver {data.summary.rejected}</p>}{!data.shippedAt&&<><p><Link href={'/salidas/pedidos/'+orderId+'/trevino'}>Abrir salida de Treviño →</Link></p><ShippingAction orderId={orderId}/></>}</div>;
}
