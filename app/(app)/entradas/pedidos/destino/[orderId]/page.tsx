import Link from 'next/link';
import {sql} from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { destinationView } from '@/lib/inventory/receiving-destination';
import DestinationEditor from './destination-editor';
import '../../receiving.css';
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
    const { orderId } = await params;
    const data = await destinationView(await requireUser(), orderId);
    const products=data.review?await sql`SELECT id::text,name FROM products WHERE status='ACTIVE' ORDER BY name`:[];
    return <main className="receivingOrders"><Link href="/entradas/pedidos">← Recepciones</Link><DestinationEditor data={data} products={products as {id:string;name:string}[]}/></main>;
}
