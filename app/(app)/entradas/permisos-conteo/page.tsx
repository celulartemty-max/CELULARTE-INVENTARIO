import Link from 'next/link';
import {requireUser} from '@/lib/auth/authorization';
import {countRequestList} from '@/lib/inventory/receiving-count-requests';
import Decisions from './decisions';
import '../pedidos/receiving.css';
export const dynamic='force-dynamic';
export default async function Page(){const rows=await countRequestList(await requireUser());return <main className="page receivingOrders"><Link href="/entradas/pedidos">← Recepciones</Link><h1>Permisos de conteo</h1><p>Autoriza a la persona para contar y después elige el destino del pedido. Cambiar el destino conserva la marca, el packing y los conteos; no registra inventario automáticamente.</p>{rows.length?rows.map(r=><section className="card pad" key={String(r.order_id)+String(r.user_id)}><h2>{String(r.product)} · {String(r.marking)}</h2><p>{String(r.requester)} · {r.status==='APPROVED'?'Autorizado':'Pendiente'}</p>{r.session_id&&<Link href={`/entradas/pedidos/${r.session_id}`}>Ver recepción →</Link>}<Decisions orderId={String(r.order_id)} userId={String(r.user_id)} approved={r.status==='APPROVED'} destination={typeof r.destination==='string'?r.destination:null}/></section>):<p>No hay solicitudes pendientes ni permisos activos.</p>}</main>}
