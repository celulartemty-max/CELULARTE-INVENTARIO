'use client';
import {useMemo,useState} from 'react';
import type {ReceiptOverview} from '@/lib/inventory/receiving-overview';
import ReceivingReceiptCard from './receiving-receipt-card';

function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX').trim();}
export default function ReceivingSearch({rows}:{rows:ReceiptOverview[]}){
 const [query,setQuery]=useState('');
 const visible=useMemo(()=>{const q=normalize(query);if(!q)return rows;return rows.filter(r=>(r.search_products??[]).some(p=>normalize(p).includes(q)));},[rows,query]);
 return <><div className="receivingListHeader"><h2>Todas las recepciones</h2><span className="receivingMuted">{visible.length} {visible.length===1?'registro':'registros'}</span></div>
 <div className="receivingProductSearch"><label htmlFor="receiving-product-search">Buscar por producto</label><div className="receivingProductSearchControl"><input id="receiving-product-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ej. Combo Case, Silicon MagSafe…" autoComplete="off" aria-label="Buscar recepciones por producto"/></div></div>
 <section className="receivingSessionList" aria-label="Recepciones">{visible.map(r=><ReceivingReceiptCard key={r.id} receipt={r}/>)}{!visible.length&&<div className="receivingEmpty card pad">{query?'No hay recepciones con ese producto.':'📦 Aún no hay recepciones.'}</div>}</section></>;
}
