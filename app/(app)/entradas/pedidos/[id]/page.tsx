import { requireUser } from '@/lib/auth/authorization';
import { receivingView } from '@/lib/inventory/receiving';
import { sql } from '@/lib/db';
import ReceivingEditor from './receiving-editor';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: {
    params: Promise<{id:string}>;
    searchParams?:Promise<{order?:string;box?:string;back?:string}>;
}) {
    const u = await requireUser(), { id } = await params;
    const data = await receivingView(u, id);
    const selected=await searchParams;
    const products = data.review ? await sql `SELECT id::text,name FROM products WHERE status='ACTIVE' ORDER BY name` : [];
    const backHref=selected?.back?.startsWith('/entradas/pedidos?')?selected.back:undefined;
    return <ReceivingEditor backHref={backHref} initialOrderId={selected?.order} initialBoxId={selected?.box} data={JSON.parse(JSON.stringify(data))} products={products as {
        id: string;
        name: string;
    }[]}/>;
}
