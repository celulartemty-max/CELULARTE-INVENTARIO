import Link from 'next/link';
import { requireUser, getAuthorizedBranchIds } from '@/lib/auth/authorization';
import { sql } from '@/lib/db';
import { receivingAccess } from '@/lib/inventory/receiving';
import ReceivingNew from './receiving-new';
import './receiving.css';
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
    const rows = ids === null ? await sql `SELECT s.id::text,s.reference,s.arrival_date::text,s.total_boxes,s.status,count(b.id)::int + COALESCE((SELECT sum(f.carton_count) FROM receiving_foreign_cartons f WHERE f.session_id=s.id AND f.voided_at IS NULL),0)::int arrived,count(b.counted_at)::int counted FROM receiving_sessions s LEFT JOIN receiving_cartons b ON b.session_id=s.id GROUP BY s.id ORDER BY s.created_at DESC` : await sql `SELECT s.id::text,s.reference,s.arrival_date::text,s.total_boxes,s.status,count(b.id)::int + COALESCE((SELECT sum(f.carton_count) FROM receiving_foreign_cartons f WHERE f.session_id=s.id AND f.voided_at IS NULL),0)::int arrived,count(b.counted_at)::int counted FROM receiving_sessions s LEFT JOIN receiving_cartons b ON b.session_id=s.id WHERE s.branch_id=ANY(${ids}::uuid[]) GROUP BY s.id ORDER BY s.created_at DESC`;
    return <main className="receivingOrders receivingHome"><header className="receivingHomeHero"><span className="receivingEyebrow">ENTRADA DE MERCANCÍA</span><h1>Recepciones</h1><p>Registra la llegada y lleva el avance de tus cajas.</p></header>{isReviewer(u.role) && <ReceivingNew branches={branches}/>}
    <div className="receivingListHeader"><h2>Tus recepciones</h2><span className="receivingMuted">{rows.length} registros</span></div>
    <section className="receivingSessionList" aria-label="Recepciones">{rows.map(r=>{
        const status=r.status==='ARCHIVED'?'Archivada · solo ajenas':r.status==='DRAFT'?'En captura':r.status==='CLOSED'?'Pendiente de registrar':'Registrada';
        const date=String(r.arrival_date).slice(0,10).split('-').reverse().join('/');
        return <Link className="receivingSessionCard" key={String(r.id)} href={`/entradas/pedidos/${r.id}`}>
            <div className="receivingSessionHeading"><span className="receivingSessionIcon" aria-hidden="true">📦</span><div><h3>{String(r.reference)}</h3><span>{date}</span></div><span className="receivingSessionStatus" data-status={String(r.status)}>{status}</span></div>
            <div className="receivingSessionNumbers"><div><strong>{String(r.arrived)} <small>/ {String(r.total_boxes)}</small></strong><span>Cajas identificadas</span></div><div><strong>{String(r.counted)}</strong><span>Cajas propias contadas</span></div></div>
            <progress aria-label={`Avance de cajas de ${r.reference}`} max={Number(r.total_boxes)} value={Number(r.arrived)}/><div className="receivingSessionFooter"><span>{Math.max(0,Number(r.total_boxes)-Number(r.arrived))} por identificar</span><b>Abrir recepción →</b></div>
        </Link>;
    })}{!rows.length&&<div className="receivingEmpty card pad">📦 Aún no hay recepciones. Crea la primera para comenzar.</div>}</section><Link className="receivingHistory" href="/entradas">Ver recepciones anteriores →</Link></main>;
}
