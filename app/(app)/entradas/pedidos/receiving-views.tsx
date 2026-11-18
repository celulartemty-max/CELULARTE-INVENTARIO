'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import type {ReceiptOverview} from '@/lib/inventory/receiving-overview';
import ReceivingSearch from './receiving-search';

type Box={id:string;number:string;counted:boolean;registered:boolean;session_id:string};
export type OrderResult={id:string;session_id:string;product:string;reference:string;marking:string;shipping:string;destination:string;origin:string;arrival_date:string;boxes:Box[];destination_order:boolean;pending_adjustment:boolean;};
type GroupedOrder=Omit<OrderResult,'boxes'> & {boxes:Box[];pending_adjustment:boolean};
const norm=(s:string)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
const PAGE_SIZE=50;
export default function ReceivingViews({rows,orders}:{rows:ReceiptOverview[];orders:OrderResult[]}){
 const [view,setView]=useState<'receipts'|'orders'>('receipts');
 const [tab,setTab]=useState<'active'|'registered'>('active');
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(1);
 const grouped=useMemo(()=>{
   const map=new Map<string,GroupedOrder>();
   for(const o of orders){
     let item=map.get(o.id);
     if(!item){item={...o,boxes:[],pending_adjustment:o.pending_adjustment};map.set(o.id,item);}
     const existing=new Set(item.boxes.map(b=>b.id));
     for(const b of o.boxes){if(!existing.has(b.id)){item.boxes.push(b);existing.add(b.id);}}
   }
   return Array.from(map.values());
 },[orders]);
 const filtered=useMemo(()=>{
   const q=norm(query);
   return grouped.filter(o=>{
     const registered=o.boxes.length>0&&o.boxes.every(b=>b.registered)&&!o.pending_adjustment;
     if((tab==='registered')!==registered)return false;
     return !q||[o.product,o.reference,o.marking,o.shipping,o.destination,...o.boxes.map(b=>'caja '+b.number)].some(x=>norm(x).includes(q));
   });
 },[grouped,query,tab]);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const visible=filtered.slice((Math.min(page,pages)-1)*PAGE_SIZE,Math.min(page,pages)*PAGE_SIZE);
 const switchTab=(next:'active'|'registered')=>{setTab(next);setPage(1);};
 return <><div className="receivingViewTabs" role="group" aria-label="Vista de entradas"><button type="button" aria-pressed={view==='receipts'} className={view==='receipts'?'active':''} onClick={()=>setView('receipts')}>📦 Recepciones</button><button type="button" aria-pressed={view==='orders'} className={view==='orders'?'active':''} onClick={()=>setView('orders')}>🗂️ Pedidos</button></div>
 {view==='receipts'?<ReceivingSearch rows={rows}/>:<>
 <div className="receivingListHeader"><h2>Pedidos por producto</h2><span className="receivingMuted">{filtered.length} pedidos</span></div>
 <div className="receivingOrderStatusTabs" role="group" aria-label="Estado de registro"><button type="button" aria-pressed={tab==='active'} onClick={()=>switchTab('active')}>Activos</button><button type="button" aria-pressed={tab==='registered'} onClick={()=>switchTab('registered')}>Registrados</button></div>
 <div className="receivingProductSearch"><label htmlFor="receiving-order-search">Buscar producto, pedido o caja</label><input id="receiving-order-search" type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Ej. Combo Case, JAPS, Caja 6…" autoComplete="off"/></div>
 <section className="receivingOrderCompactList" aria-label="Pedidos encontrados">
 {visible.map(o=>{
   const counted=o.boxes.filter(b=>b.counted).length;
   const total=o.boxes.length;
   const complete=total>0&&counted===total;
   const href=o.destination_order?`/entradas/pedidos/destino/${o.id}`:`/entradas/pedidos/${o.boxes[0]?.session_id??o.session_id}?order=${o.id}`;
   return <Link className="receivingOrderCompactRow" key={o.id} href={href}>
     <div className="receivingOrderCompactMain"><strong>{o.product}</strong><span>{o.marking} · {o.shipping}</span>
     <small className={complete?'receivingOrderCountComplete':'receivingOrderCountProgress'}>{complete?'✓ Contada · '+counted+'/'+total+' cajas':counted>0?'✓ '+counted+' de '+total+' cajas contadas':'○ Pendiente de conteo'}</small></div>
     <div className="receivingOrderCompactRight"><span>{total} {total===1?'caja':'cajas'}</span><b aria-hidden="true">›</b></div>
   </Link>;
 })}
 {!visible.length&&<div className="receivingEmpty">{query?'No encontramos pedidos con esa búsqueda.':tab==='registered'?'Todavía no hay pedidos completamente registrados.':'No hay pedidos activos.'}</div>}
 </section>
 {pages>1&&<nav className="receivingOrderPagination" aria-label="Páginas de pedidos"><button type="button" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Anterior</button><span>Página {Math.min(page,pages)} de {pages}</span><button type="button" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Siguiente →</button></nav>}
 </>}
 </>;
}
