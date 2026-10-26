import Link from 'next/link';
import {requireUser,getAuthorizedBranchIds,hasModulePermission} from '@/lib/auth/authorization';
import {sql} from '@/lib/db';
export default async function ReceivingSummary(){
 const u=await requireUser();if(!await hasModulePermission(u,'ENTRADAS'))return null;
 const ids=await getAuthorizedBranchIds(u);
 const rows=ids===null?await sql`SELECT id::text,reference,status,arrival_date::text FROM receiving_sessions ORDER BY created_at DESC LIMIT 5`:await sql`SELECT id::text,reference,status,arrival_date::text FROM receiving_sessions WHERE branch_id=ANY(${ids}::uuid[]) ORDER BY created_at DESC LIMIT 5`;
 return <section className="card pad" style={{margin:'18px 0'}}><h2>Recepciones por pedido</h2><p><Link href="/entradas/pedidos">Abrir panel y crear recepción →</Link></p>{rows.map(r=><p key={String(r.id)}><Link href={`/entradas/pedidos/${r.id}`}>{String(r.reference)} · {String(r.arrival_date)} · {r.status==='DRAFT'?'En captura':r.status==='CLOSED'?'Pendiente de registrar':r.status==='ARCHIVED'?'Archivada · solo ajenas':'Registrada'}</Link></p>)}{!rows.length&&<small>Las nuevas recepciones aparecerán aquí. Los movimientos anteriores se conservan debajo.</small>}</section>;
}
