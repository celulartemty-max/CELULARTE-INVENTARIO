import Link from 'next/link';
import { requireUser, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { sql } from '@/lib/db';
import { receivingAccess } from '@/lib/inventory/receiving';
import ReceivingNew from './receiving-new';
import { isReviewer } from '@/lib/inventory/receiving-validation';
export const dynamic = 'force-dynamic';
export default async function Page() {
    const u = await requireUser();
    await receivingAccess(u);
    const ids = await getAuthorizedBranchIds(u);
    const all = await sql `SELECT id::text,name FROM branches WHERE status='ACTIVE' AND name IN ('Treviño','Plaza del Audio') ORDER BY name`;
    const branches = all.filter(b => ids === null || ids.includes(String(b.id))) as {
        id: string;
        name: string;
    }[];
    const rows = ids === null ? await sql `SELECT s.id::text,s.reference,s.arrival_date::text,s.total_boxes,s.status,count(b.id)::int arrived,count(b.counted_at)::int counted FROM receiving_sessions s LEFT JOIN receiving_cartons b ON b.session_id=s.id GROUP BY s.id ORDER BY s.created_at DESC` : await sql `SELECT s.id::text,s.reference,s.arrival_date::text,s.total_boxes,s.status,count(b.id)::int arrived,count(b.counted_at)::int counted FROM receiving_sessions s LEFT JOIN receiving_cartons b ON b.session_id=s.id WHERE s.branch_id=ANY(${ids}::uuid[]) GROUP BY s.id ORDER BY s.created_at DESC`;
    return <main><header><h1>Recepciones por pedido</h1><p>Cajas independientes, llegadas parciales y conteo a ciegas.</p></header>{isReviewer(u.role) && <ReceivingNew branches={branches}/>}<section className="card pad"><h2>Recepciones</h2>{rows.map(r => <p key={String(r.id)}><Link href={`/entradas/pedidos/${r.id}`}><b>{String(r.reference)}</b> · {String(r.arrival_date)} · {String(r.arrived)}/{String(r.total_boxes)} cajas asignadas · {String(r.counted)} contadas · {String(r.status)} →</Link></p>)}{!rows.length && <p>Aún no hay recepciones por pedido.</p>}<Link href="/entradas">Ver recepciones anteriores</Link></section></main>;
}
