import Link from 'next/link';
import { requireUser, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { sql } from '@/lib/db';
import { receivingAccess } from '@/lib/inventory/receiving';
import ReceivingNew from './receiving-new';
import './receiving.css';
import { isReviewer } from '@/lib/inventory/receiving-validation';
import { receivingOverview } from '@/lib/inventory/receiving-overview';
import ReceivingReceiptCard from './receiving-receipt-card';
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
    const rows = await receivingOverview(u);
    return <main className="receivingOrders receivingHome"><header className="receivingHomeHero"><span className="receivingEyebrow">ENTRADA DE MERCANCÍA</span><h1>Recepciones</h1><p>Registra la llegada y lleva el avance de tus cajas.</p></header>{isReviewer(u.role) && <ReceivingNew branches={branches}/>}
    <div className="receivingListHeader"><h2>Tus recepciones</h2><span className="receivingMuted">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span></div>
    <section className="receivingSessionList" aria-label="Recepciones">{rows.map(r => <ReceivingReceiptCard key={r.id} receipt={r}/>)}{!rows.length&&<div className="receivingEmpty card pad">📦 Aún no hay recepciones para tu sucursal.</div>}</section><Link className="receivingHistory" href="/entradas">Ver recepciones anteriores →</Link></main>;
}
