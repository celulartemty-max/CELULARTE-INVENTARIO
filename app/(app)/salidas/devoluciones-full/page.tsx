import '../full-orders.css';
import Link from 'next/link';
import {requireUser} from '@/lib/auth/authorization';
import {fullReturnData} from '@/lib/inventory/full-review';
import {ReturnBasket} from '../pedidos/workflow-controls';
export default async function Page(){const user=await requireUser(),data=await fullReturnData(user);return <div className="fullWorkspace"><Link href="/salidas">← Salidas</Link><h1>Regresos a Plaza</h1><ReturnBasket {...data}/><details><summary>Recibidas en Plaza</summary>{data.history.length?data.history.map(h=><details key={h.folio}><summary>{h.folio} · {h.received} piezas ✓</summary>{h.parts.map((p,i)=><p key={i}>FULL #{p.reference} · {p.product} · {p.received} piezas<br/>{p.detail}</p>)}</details>):<p>Sin devoluciones terminadas.</p>}</details><details><summary>Detalles</summary><p>Cada partida conserva su FULL de origen. La devolución no crea otra alta ni baja de inventario; confirma por separado cualquier corrección pendiente en sistema.</p></details></div>;}
