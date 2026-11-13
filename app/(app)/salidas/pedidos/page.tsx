import '../full-orders.css';
import './compact-list.css';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { fullOrderRows,fullOrderStatus,type FullExit } from '@/lib/inventory/full-orders';
export default async function Page({searchParams}:{searchParams:Promise<{page?:string;view?:string}>}){
 const query=await searchParams,page=/^\d+$/.test(query.page||'')?Math.min(Number(query.page),100000):0;
 const user=await requireUser(),rows=await fullOrderRows(user,undefined,page,query.view==='history');
 const groups=new Map<string,FullExit[]>();for(const row of rows)groups.set(row.id,[...(groups.get(row.id)||[]),row]);
 const history=query.view==='history';
 return <div className="fullWorkspace fullOrderList">
  <Link className="fullListBack" href="/salidas">← Salidas</Link>
  <h1>Gestión de Pedidos</h1>
  <Link className="fullListReturns" href="/salidas/devoluciones-full">Regresos a Plaza →</Link>
  <nav className="fullListTabs" aria-label="Estado de los pedidos">
   <Link href="/salidas/pedidos" aria-current={!history?'page':undefined}>Pendientes</Link>
   <Link href="/salidas/pedidos?view=history" aria-current={history?'page':undefined}>Enviados</Link>
  </nav>
  {!groups.size&&<p>No hay pedidos en esta vista.</p>}
  <div className="fullListRows">{[...groups].map(([id,parts])=>{
   const total=parts.reduce((n,p)=>n+(p.status==='CANCELLED'?0:p.pieces),0);
   return <Link className="fullListRow" href={'/salidas/pedidos/'+id} key={id}>
    <div className="fullListInfo"><small>FULL #{parts[0].reference}</small><h2>{parts[0].title}</h2><div className="fullListMeta"><span>{fullOrderStatus(parts)}</span><small>{parts.map(p=>p.branch==='Plaza del Audio'?'Plaza':p.branch).join(' + ')}</small></div></div>
    <strong className="fullListCount">{total.toLocaleString('es-MX')} <small>pzas</small></strong><span className="fullListArrow" aria-hidden="true">›</span>
   </Link>;
  })}</div>
  {user.role!=='MASTER'&&groups.size>0&&<p className="fullListScope">Cantidades de tus sucursales.</p>}
  {(page>0||groups.size===50)&&<div className="fullListPagination">{page>0&&<Link href={'/salidas/pedidos?view='+(history?'history':'open')+'&page='+(page-1)}>← Anteriores</Link>}<small>Página {page+1}</small>{groups.size===50&&<Link href={'/salidas/pedidos?view='+(history?'history':'open')+'&page='+(page+1)}>Siguientes →</Link>}</div>}
 </div>;
}
