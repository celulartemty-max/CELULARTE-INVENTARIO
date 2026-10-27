import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { destinationView } from '@/lib/inventory/receiving-destination';
import DestinationEditor from './destination-editor';
import '../../receiving.css';
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await params;
    const data = await destinationView(await requireUser(), orderId);
    return <main className="receivingOrders"><Link href="/entradas/pedidos/destino">← Pedidos por recibir</Link><DestinationEditor data={data}/></main>;
}
