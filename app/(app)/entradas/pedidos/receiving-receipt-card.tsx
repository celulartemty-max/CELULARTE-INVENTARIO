import Link from 'next/link';
import {receiptTitle} from '@/lib/inventory/receipt-title';
import type { ReceiptOverview } from '@/lib/inventory/receiving-overview';

export default function ReceivingReceiptCard({ receipt: r }: { receipt: ReceiptOverview }) {
    const status = r.status === 'ARCHIVED' ? 'Archivada · solo ajenas' : r.status === 'DRAFT' ? 'En captura' : r.status === 'CLOSED' ? 'Pendiente de registrar' : 'Registrada';
    const date = r.arrival_date.slice(0, 10).split('-').reverse().join('/');
    const boxesForDestination = r.destinations.reduce((n, d) => n + d.boxes, 0);
    const destinationCounted = r.destinations.reduce((n, d) => n + (d.can_open ? d.counted : 0), 0);
    const grouped = new Map<string, typeof r.destinations>();
    for (const d of r.destinations) {
        const key = `${d.destination} · ${d.marking}`;
        grouped.set(key, [...(grouped.get(key) ?? []), d]);
    }
    return <article className="receivingSessionCard receivingReceiptCard">
        <div className="receivingSessionHeading"><span className="receivingSessionIcon" aria-hidden="true">📦</span><div><h3>{receiptTitle(r.arrival_date,r.total_boxes)}</h3><span>{date} · {r.origin}</span></div>{r.can_open && <span className="receivingSessionStatus" data-status={r.status}>{status}</span>}</div>
        <div className="receivingSessionNumbers"><div><strong>{r.arrived} <small>/ {r.total_boxes}</small></strong><span>Cajas identificadas{!r.can_open && ' en origen'}</span></div><div><strong>{r.can_open ? r.counted ?? 0 : destinationCounted}</strong><span>{r.can_open ? 'Cajas propias contadas' : 'Cajas contadas en tu sucursal'}</span></div></div>
        <progress aria-label={`Avance de cajas de ${r.reference}`} max={r.total_boxes} value={r.arrived}/>
        <div className="receivingSessionFooter"><span>{Math.max(0, r.total_boxes - r.arrived)} por identificar</span>{r.can_open && <Link className="receivingReceiptOpen" href={`/entradas/pedidos/${r.id}`}>Abrir recepción →</Link>}</div>
        {r.destinations.length > 0 && <details className="receivingReceiptDestinations"><summary><span><b>Cajas por sucursal</b><small>{boxesForDestination} de estas {r.total_boxes} cajas {r.can_open ? 'son para otra sucursal' : 'son para tu sucursal'}</small></span><span className="receivingReceiptChevron" aria-hidden="true">⌄</span></summary>
            <div className="receivingReceiptDestinationList">{Array.from(grouped, ([name, orders]) => <section key={name} className="receivingReceiptDestination"><div className="receivingReceiptDestinationTitle"><h4>{name}</h4><span>{orders.reduce((n, o) => n + o.boxes, 0)} cajas</span></div>
                {orders.map(o => <div key={o.order_id} className="receivingReceiptDestinationOrder"><div><b>{o.product}</b><small>{o.shipping} · {o.boxes} cajas de esta recepción</small><small>{o.arrived} recibidas en destino · {o.counted} contadas</small></div>{o.can_open ? <Link className="receivingReceiptDestinationOpen" href={`/entradas/pedidos/destino/${o.order_id}`}>Ver cajas →</Link> : <span className="receivingReceiptDestinationWait">Confirma su llegada en {o.destination}</span>}</div>)}
            </section>)}</div>
        </details>}
    </article>;
}
