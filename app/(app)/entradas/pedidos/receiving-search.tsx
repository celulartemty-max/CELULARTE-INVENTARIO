'use client';
import type {ReceiptOverview} from '@/lib/inventory/receiving-overview';
import ReceivingReceiptCard from './receiving-receipt-card';

export default function ReceivingSearch({rows}:{rows:ReceiptOverview[]}){
 return <><div className="receivingListHeader"><h2>Todas las recepciones</h2><span className="receivingMuted">{rows.length} {rows.length===1?'registro':'registros'}</span></div>
 <section className="receivingSessionList" aria-label="Recepciones">{rows.map(r=><ReceivingReceiptCard key={r.id} receipt={r}/>)}{!rows.length&&<div className="receivingEmpty card pad">📦 Aún no hay recepciones.</div>}</section></>;
}
