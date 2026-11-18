'use client';
import {useMemo,useState} from 'react';
import Link from 'next/link';
import type {ReceiptOverview} from '@/lib/inventory/receiving-overview';
import ReceivingSearch from './receiving-search';

export type OrderResult={id:string;session_id:string;product:string;reference:string;marking:string;shipping:string;destination:string;origin:string;arrival_date:string;boxes:{id:string;number:string;counted:boolean}[];destination_order:boolean;};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();
export default function ReceivingViews({rows,orders}:{rows:ReceiptOverview[];orders:OrderResult[]}){
 const [view,setView]=useState<'receipts'|'orders'>('receipts'),[query,setQuery]=useState('');
 const filtered=useMemo(()=>{const q=norm(query);return q?orders.filter(o=>[o.product,o.reference,o.marking,o.destination,o.origin,...o.boxes.map(b=>'caja '+b.number)].some(x=>norm(x).includes(q))):orders},[orders,query]);
 return <><div className="receivingViewTabs" role="group" aria-label="Vista de entradas"><button type="button" aria-pressed={view==='receipts'} className={view==='receipts'?'active':''} onClick={()=>setView('receipts')}>📦 Recepciones</button><button type="button" aria-pressed={view==='orders'} className={view==='orders'?'active':''} onClick={()=>setView('orders')}>🗂️ Pedidos</button></div>
 {view==='receipts'?<ReceivingSearch rows={rows}/>:<><div className="receivingListHeader"><h2>Pedidos por producto</h2><span className="receivingMuted">{filtered.length} pedidos</span></div><div className="receivingProductSearch"><label htmlFor="receiving-order-search">Buscar producto, pedido o caja</label><input id="receiving-order-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ej. Combo Case, JAPS, Caja 6…" autoComplete="off"/></div><section className="receivingOrderResults" aria-label="Pedidos encontrados">{filtered.map(o=><article className="card pad receivingOrderResult" key={o.id}><div><h3>{o.product}</h3><p className="receivingMuted">{o.marking} · {o.shipping} · {o.destination}</p><small>{o.arrival_date.slice(0,10).split('-').reverse().join('/')} · Recepción: {o.origin}</small><p className="receivingMuted">{o.boxes.length} cajas · {o.boxes.filter(b=>b.counted).length} contadas</p></div><div className="receivingOrderLinks"><Link href={o.destination_order?`/entradas/pedidos/destino/${o.id}`:`/entradas/pedidos/${o.session_id}?order=${o.id}`}>Abrir pedido →</Link><div className="receivingOrderBoxLinks">{o.boxes.map(b=><Link key={b.id} href={o.destination_order?`/entradas/pedidos/destino/${o.id}`:`/entradas/pedidos/${o.session_id}?order=${o.id}&box=${b.id}`} title={b.counted?'Caja contada':'Caja pendiente de conteo'}>Caja {b.number} {b.counted?'✓':'·'}</Link>)}</div></div></article>)}{!filtered.length&&<div className="card pad">No encontramos pedidos con esa búsqueda.</div>}</section></>}
 </>;
}
