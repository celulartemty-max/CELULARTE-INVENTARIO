import Link from 'next/link';
import {sql} from '@/lib/db';
import { requireUser } from '@/lib/auth/authorization';
import { destinationView } from '@/lib/inventory/receiving-destination';
import DestinationEditor from './destination-editor';
import '../../receiving.css';
export const dynamic = 'force-dynamic';

export default async function Page({ params,searchParams }: { params: Promise<{ orderId: string }>;searchParams?:Promise<{back?:string}> }) {
    const { orderId } = await params;
    const back=(await searchParams)?.back;
    const backHref=back?.startsWith('/entradas/pedidos?')?back:'/entradas/pedidos?view=orders';
    const data = await destinationView(await requireUser(), orderId);
    const products=data.review?await sql`SELECT id::text,name FROM products WHERE status='ACTIVE' ORDER BY name`:[];
    return <main className="receivingOrders"><Link href={backHref}>← Pedidos</Link><DestinationEditor data={data} products={products as {id:string;name:string}[]}/></main>;
}
