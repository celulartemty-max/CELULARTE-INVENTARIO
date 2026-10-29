import Link from 'next/link';
import { requireUser, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { sql } from '@/lib/db';
import { receivingAccess } from '@/lib/inventory/receiving';
import ReceivingNew from './receiving-new';
import './receiving.css';
import { receivingOverview } from '@/lib/inventory/receiving-overview';
import ReceivingReceiptCard from './receiving-receipt-card';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams=Promise.resolve({})}:{searchParams?:Promise<{status?:string}>}) {
    const u = await requireUser();
    await receivingAccess(u);
    const ids = await getAuthorizedBranchIds(u);
    const all = await sql `SELECT id::text,name FROM branches WHERE status='ACTIVE' AND name IN ('Treviño','Plaza del Audio') ORDER BY name`;
    const branches = all.filter(b => ids === null || ids.includes(String(b.id))) as {
        id: string;
        name: string;
    }[];
    const filter=(await searchParams).status;
    const allRows=await receivingOverview(u);
    const cutoff=new Date().getTime()-30*86400000;
    const rows=allRows.filter(r=>filter==='open'?r.can_open&&r.status==='DRAFT':filter==='closed'?r.can_open&&['CLOSED','POS_REGISTERED','ARCHIVED'].includes(r.status)&&new Date(r.created_at||r.arrival_date).getTime()>=cutoff:true);
    return <main className="receivingOrders receivingHome"><header className="receivingHomeHero"><span className="receivingEyebrow">ENTRADA DE MERCANCÍA</span><h1>Recepciones</h1><p>Registra la llegada y lleva el avance de tus cajas.</p></header>{branches.length>0 ? <ReceivingNew branches={branches} canFreight={u.role==='MASTER'}/> : <p role="status">Tu usuario no tiene una sucursal habilitada para crear recepciones. Solicita al administrador que revise tu asignación.</p>}
    <div className="receivingListHeader"><h2>Tus recepciones</h2><span className="receivingMuted">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span></div>
    <section className="receivingSessionList" aria-label="Recepciones">{rows.map(r => <ReceivingReceiptCard key={r.id} receipt={r}/>)}{!rows.length&&<div className="receivingEmpty card pad">📦 Aún no hay recepciones para tu sucursal.</div>}</section><Link className="receivingHistory" href="/entradas">Ver recepciones anteriores →</Link></main>;
}
