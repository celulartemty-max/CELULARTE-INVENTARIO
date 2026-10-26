import { requireUser } from '@/lib/auth/authorization';
import { receivingView } from '@/lib/inventory/receiving';
import { sql } from '@/lib/db';
import ReceivingEditor from './receiving-editor';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const u = await requireUser(), { id } = await params;
    const data = await receivingView(u, id);
    const products = data.review ? await sql `SELECT id::text,name FROM products WHERE status='ACTIVE' ORDER BY name` : [];
    return <ReceivingEditor data={JSON.parse(JSON.stringify(data))} products={products as {
        id: string;
        name: string;
    }[]}/>;
}
