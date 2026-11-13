import Link from 'next/link';
import {requireUser} from '@/lib/auth/authorization';
import {countRequestList} from '@/lib/inventory/receiving-count-requests';
import Decisions from './decisions';
import '../pedidos/receiving.css';
export const dynamic='force-dynamic';
export default async function Page(){const rows=await countRequestList(await requireUser());return <main className="page"><Link href="/entradas/pedidos">← Recepciones</Link><h1>Permisos de conteo</h1><p>La autorización es solo para esa persona y ese pedido. No cambia sucursal, inventario ni registro en sistema.</p>{rows.length?rows.map(r=><section className="card pad" key={String(r.order_id)+String(r.user_id)}><h2>{String(r.product)} · {String(r.marking)}</h2><p>{String(r.requester)} · {r.status==='APPROVED'?'Autorizado':'Pendiente'}</p>{r.session_id&&<Link href={`/entradas/pedidos/${r.session_id}`}>Ver recepción →</Link>}<Decisions orderId={String(r.order_id)} userId={String(r.user_id)} approved={r.status==='APPROVED'}/></section>):<p>No hay solicitudes pendientes ni permisos activos.</p>}</main>}
