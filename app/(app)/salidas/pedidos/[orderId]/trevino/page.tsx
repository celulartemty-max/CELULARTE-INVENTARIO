import Link from 'next/link';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth/authorization';
import {fullReviewData} from '@/lib/inventory/full-review';
import {sql} from '@/lib/db';
import {Contribution} from '../../workflow-controls';
export default async function Page({params}:{params:Promise<{orderId:string}>}){
 const user=await requireUser(),{orderId}=await params,data=await fullReviewData(user,orderId);
 if(!data.canReview)return <p>Sin acceso a Treviño.</p>;
 const exits=await sql`SELECT x.movement_id::text FROM full_order_exits x JOIN branches b ON b.id=x.branch_id WHERE x.order_id=${orderId}::uuid AND b.name='Treviño'`;
 if(exits[0])redirect('/salidas/'+exits[0].movement_id);
 const order=await sql`SELECT id::text,title FROM full_orders WHERE id=${orderId}::uuid`;
 if(!order[0])return <p>Pedido no encontrado.</p>;
 return <div style={{maxWidth:680,margin:'0 auto'}}><Link href={'/salidas/pedidos/'+orderId}>← Pedido</Link><h1>Treviño</h1>{data.shippedAt?<p>FULL enviado.</p>:<Contribution orderId={orderId} products={data.products}/>}</div>;
}
