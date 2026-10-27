import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { destinationOrders } from '@/lib/inventory/receiving-destination';
import '../receiving.css';
export const dynamic = 'force-dynamic';

export default async function Page() {
    const orders = await destinationOrders(await requireUser());
    return <main className="receivingOrders receivingHome">
        <Link href="/entradas/pedidos">← Recepciones</Link>
        <header className="receivingHomeHero"><span className="receivingEyebrow">EN TU SUCURSAL</span><h1>Pedidos por recibir</h1><p>Confirma las cajas cuando lleguen físicamente. Después podrás abrirlas y contarlas.</p></header>
        <section className="receivingSessionList" aria-label="Pedidos destinados a tu sucursal">{orders.map(o => <Link key={o.id} className="receivingSessionCard" href={`/entradas/pedidos/destino/${o.id}`}>
            <h2>{o.product}</h2><p>{o.marking} · {o.shipping} · {o.total} cajas</p><p>{o.origin} → {o.destination}</p>
            <div className="receivingSessionNumbers"><div><strong>{o.arrived} / {o.total}</strong><span>Recibidas en destino</span></div><div><strong>{o.counted}</strong><span>Contadas</span></div></div>
            <span className="receivingMuted">{o.physical - o.arrived} por trasladar · {o.total - o.physical} aún sin llegar al origen</span><div className="receivingSessionFooter"><span>{o.reference}</span><b>Abrir pedido →</b></div>
        </Link>)}</section>
        {!orders.length && <p className="card pad">No hay pedidos trasladados desde otra sucursal para ti.</p>}
    </main>;
}
