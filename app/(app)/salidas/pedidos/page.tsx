import '../full-orders.css';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { fullOrderRows,fullOrderStatus,type FullExit } from '@/lib/inventory/full-orders';
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){
 const query=await searchParams,page=/^\d+$/.test(query.page||'')?Math.min(Number(query.page),100000):0;
 const user=await requireUser(),rows=await fullOrderRows(user,undefined,page);
 const groups=new Map<string,FullExit[]>();for(const row of rows)groups.set(row.id,[...(groups.get(row.id)||[]),row]);
 return <div className="fullWorkspace"><Link href="/salidas">← Salidas</Link><h1>Gestión de Pedidos</h1><p>Pedidos FULL pendientes de tus sucursales.</p>{!groups.size&&<p>No hay pedidos pendientes.</p>}{[...groups].map(([id,parts])=><article className="card pad" key={id} style={{marginTop:16}}><small>FULL #{parts[0].reference}</small><h2>{parts[0].title}</h2><p>{fullOrderStatus(parts)} · {parts.map(p=>p.branch).join(' + ')}</p><p>{parts.reduce((n,p)=>n+(p.status==='CANCELLED'?0:p.pieces),0).toLocaleString('es-MX')} piezas capturadas{user.role!=='MASTER'?' en tus sucursales':''}</p><Link href={'/salidas/pedidos/'+id}>Abrir pedido →</Link></article>)}{(page>0||groups.size===50)&&<p>{page>0&&<Link href={'/salidas/pedidos?page='+(page-1)}>← Anteriores</Link>} · Página {page+1} · {groups.size===50&&<Link href={'/salidas/pedidos?page='+(page+1)}>Siguientes →</Link>}</p>}</div>;
}
