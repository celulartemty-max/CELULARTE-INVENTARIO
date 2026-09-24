import Link from "next/link";
import { requireUser, getAuthorizedBranchIds } from "@/lib/auth/authorization";
import { sql } from "@/lib/db";

const fmt=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Monterrey",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const receptionDateFmt=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Monterrey",day:"numeric",month:"long"});
const badgeDateFmt=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Monterrey",day:"2-digit",month:"short",year:"numeric"});
const detail=(id:string,type:string)=>type==='RECEPTION'?`/entradas/${id}`:type.startsWith('RETURN_')?`/devoluciones/${id}`:type==='EXIT'?`/salidas/${id}`:type==='TRANSFER'?`/traspasos/${id}`:'#';
const typeLabel=(v:string)=>({RECEPTION:'Recepción',RETURN_ML:'Devolución Mercado Libre',RETURN_TIKTOK:'Devolución TikTok',RETURN_CUSTOMER:'Devolución de cliente',EXIT:'Salida',TRANSFER:'Traspaso'}[v]??v);
const tone=(v:string)=>v==='EXIT'?'toneRed':v==='TRANSFER'?'tonePurple':v.startsWith('RETURN_')?'toneGreen':'toneBlue';

type IconKind='RECEPTION'|'RETURN'|'EXIT'|'TRANSFER'|'CHECK';
function MovementIcon({kind}:{kind:IconKind}){
  const common={width:26,height:26,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true};
  if(kind==='RECEPTION')return <svg {...common}><path d="M4.5 8.2 12 4l7.5 4.2v8.4L12 21l-7.5-4.4Z"/><path d="m4.8 8.4 7.2 4.1 7.2-4.1M12 12.5V21"/><path d="M12 2v6m0 0-2.2-2.2M12 8l2.2-2.2"/></svg>;
  if(kind==='RETURN')return <svg {...common}><path d="M8 7H5V4"/><path d="M5.4 7A8 8 0 1 1 4 14"/><path d="M9 10.2 12 8.5l3 1.7v3.6L12 15.5l-3-1.7Z"/><path d="m9.2 10.3 2.8 1.6 2.8-1.6"/></svg>;
  if(kind==='EXIT')return <svg {...common}><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M17 12H9"/></svg>;
  if(kind==='TRANSFER')return <svg {...common}><path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3"/></svg>;
  return <svg {...common}><path d="M5 12.5 9.2 17 19 7"/></svg>;
}
const iconKind=(v:string):IconKind=>v==='EXIT'?'EXIT':v==='TRANSFER'?'TRANSFER':v.startsWith('RETURN_')?'RETURN':'RECEPTION';

export default async function Dashboard(){
  const user=await requireUser(),branches=await getAuthorizedBranchIds(user);
  const rows=branches===null?await sql`SELECT m.id,m.folio,m.movement_type::text type,CASE WHEN m.movement_type='TRANSFER' THEN t.status::text ELSE m.status::text END status,m.created_at,CASE WHEN m.movement_type='TRANSFER' THEN (t.origin_pos_registered_at IS NOT NULL AND t.destination_pos_registered_at IS NOT NULL) ELSE m.pos_registered_at IS NOT NULL END registered,CASE WHEN m.movement_type='TRANSFER' THEN ob.name||' → '||db.name ELSE b.name END branch,u.name user_name,p.name product_name,r.expected_boxes FROM inventory_movements m JOIN branches b ON b.id=m.branch_id JOIN users u ON u.id=m.created_by LEFT JOIN receptions r ON r.movement_id=m.id LEFT JOIN products p ON p.id=r.product_id LEFT JOIN transfers t ON t.movement_id=m.id LEFT JOIN branches ob ON ob.id=t.origin_branch_id LEFT JOIN branches db ON db.id=t.destination_branch_id ORDER BY m.created_at DESC LIMIT 8`:branches.length===0?[]:await sql`SELECT m.id,m.folio,m.movement_type::text type,CASE WHEN m.movement_type='TRANSFER' THEN t.status::text ELSE m.status::text END status,m.created_at,CASE WHEN m.movement_type='TRANSFER' THEN (t.origin_pos_registered_at IS NOT NULL AND t.destination_pos_registered_at IS NOT NULL) ELSE m.pos_registered_at IS NOT NULL END registered,CASE WHEN m.movement_type='TRANSFER' THEN ob.name||' → '||db.name ELSE b.name END branch,u.name user_name,p.name product_name,r.expected_boxes FROM inventory_movements m JOIN branches b ON b.id=m.branch_id JOIN users u ON u.id=m.created_by LEFT JOIN receptions r ON r.movement_id=m.id LEFT JOIN products p ON p.id=r.product_id LEFT JOIN transfers t ON t.movement_id=m.id LEFT JOIN branches ob ON ob.id=t.origin_branch_id LEFT JOIN branches db ON db.id=t.destination_branch_id WHERE (m.movement_type<>'TRANSFER' AND m.branch_id=ANY(${branches}::uuid[])) OR (m.movement_type='TRANSFER' AND (t.origin_branch_id=ANY(${branches}::uuid[]) OR t.destination_branch_id=ANY(${branches}::uuid[]))) ORDER BY m.created_at DESC LIMIT 8`;
  const statsRows=branches===null?await sql`SELECT count(*) FILTER(WHERE m.movement_type='RECEPTION' AND m.status::text='DRAFT')::int reception_in_progress,count(*) FILTER(WHERE m.movement_type='RECEPTION' AND m.status::text<>'DRAFT' AND m.created_at>=now()-interval '30 days')::int receptions_closed_30,count(*) FILTER(WHERE m.movement_type='EXIT' AND m.pos_registered_at IS NOT NULL AND m.created_at>=now()-interval '30 days')::int exits_registered_30,count(*) FILTER(WHERE m.movement_type='TRANSFER' AND COALESCE(t.status::text,'') NOT IN ('COMPLETED','CANCELLED'))::int active_transfers FROM inventory_movements m LEFT JOIN transfers t ON t.movement_id=m.id`:branches.length===0?[{reception_in_progress:0,receptions_closed_30:0,exits_registered_30:0,active_transfers:0}]:await sql`WITH a AS (SELECT m.*,t.status::text transfer_status FROM inventory_movements m LEFT JOIN transfers t ON t.movement_id=m.id WHERE (m.movement_type<>'TRANSFER' AND m.branch_id=ANY(${branches}::uuid[])) OR (m.movement_type='TRANSFER' AND (t.origin_branch_id=ANY(${branches}::uuid[]) OR t.destination_branch_id=ANY(${branches}::uuid[])))) SELECT count(*) FILTER(WHERE movement_type='RECEPTION' AND status::text='DRAFT')::int reception_in_progress,count(*) FILTER(WHERE movement_type='RECEPTION' AND status::text<>'DRAFT' AND created_at>=now()-interval '30 days')::int receptions_closed_30,count(*) FILTER(WHERE movement_type='EXIT' AND pos_registered_at IS NOT NULL AND created_at>=now()-interval '30 days')::int exits_registered_30,count(*) FILTER(WHERE movement_type='TRANSFER' AND COALESCE(transfer_status,'') NOT IN ('COMPLETED','CANCELLED'))::int active_transfers FROM a`;
  const stats=statsRows[0]??{};
  const branchName=user.primaryBranchId?(await sql`SELECT name FROM branches WHERE id=${user.primaryBranchId}::uuid`)[0]?.name:null;
  const firstName=user.name.split(/\s+/)[0]||user.name;

  return <div className="dashboardV2">
    <section className="dashTop">
      <div className="dashGreeting"><h1>Hola, {firstName}</h1><p>{branchName?`Sucursal ${String(branchName)}`:user.role==='MASTER'?'Acceso global':'Sucursal asignada'}</p></div>
      <div className="dateBadge">{badgeDateFmt.format(new Date())}</div>
    </section>
    <section className="dashStatsV2" aria-label="Resumen operativo">
      <Link href="/entradas" className="statV2"><span className="statV2Icon toneBlue"><MovementIcon kind="RECEPTION"/></span><strong>{Number(stats.reception_in_progress??0).toLocaleString('es-MX')}</strong><small>Recepciones<br/>en proceso</small><span className="statV2Arrow">›</span></Link>
      <Link href="/movimientos?view=receptions-closed" className="statV2"><span className="statV2Icon toneGreen"><MovementIcon kind="CHECK"/></span><strong>{Number(stats.receptions_closed_30??0).toLocaleString('es-MX')}</strong><small>Recepciones cerradas<br/>(últimos 30 días)</small><span className="statV2Arrow">›</span></Link>
      <Link href="/movimientos?view=exits-registered" className="statV2"><span className="statV2Icon toneRed"><MovementIcon kind="EXIT"/></span><strong>{Number(stats.exits_registered_30??0).toLocaleString('es-MX')}</strong><small>Salidas registradas<br/>(últimos 30 días)</small><span className="statV2Arrow">›</span></Link>
      <Link href="/movimientos?view=transfers-active" className="statV2"><span className="statV2Icon tonePurple"><MovementIcon kind="TRANSFER"/></span><strong>{Number(stats.active_transfers??0).toLocaleString('es-MX')}</strong><small>Traspasos<br/>activos</small><span className="statV2Arrow">›</span></Link>
    </section>
    <section id="movimientos" className="dashSection">
      <div className="dashSectionHead"><h2>Movimientos recientes</h2><Link href="/movimientos">Últimos {rows.length} ›</Link></div>
      <div className="recentV2">{rows.length===0?<div className="dashEmpty">Aún no hay movimientos para mostrar.</div>:rows.map(r=>{const id=String(r.id),type=String(r.type);const isReception=type==='RECEPTION'&&r.product_name;const title=isReception?String(r.product_name):typeLabel(type);const meta=isReception?`${receptionDateFmt.format(new Date(String(r.created_at)))} · ${Number(r.expected_boxes)} caja${Number(r.expected_boxes)===1?'':'s'} · ${String(r.branch)}`:`${String(r.folio)} · ${String(r.branch)}`;return <Link href={detail(id,type)} className="recentV2Row" key={id}><span className={`recentV2Icon ${tone(type)}`}><MovementIcon kind={iconKind(type)}/></span><span className="recentV2Text"><b>{title}</b><small>{meta}</small></span><span className="recentV2Date">{fmt.format(new Date(String(r.created_at)))}</span><span className="recentV2Arrow">›</span></Link>})}</div>
    </section>
    <section className="dashSection">
      <div className="dashSectionHead"><h2>Acciones rápidas</h2></div>
      <div className="quickV2Grid">
        <Link href="/entradas/nueva" className="quickV2 quickBlue"><span className="quickV2Icon toneBlue"><MovementIcon kind="RECEPTION"/></span><span>Nueva recepción</span><span>›</span></Link>
        <Link href="/devoluciones/nueva" className="quickV2 quickGreen"><span className="quickV2Icon toneGreen"><MovementIcon kind="RETURN"/></span><span>Nueva devolución</span><span>›</span></Link>
        <Link href="/salidas/nueva" className="quickV2 quickRed"><span className="quickV2Icon toneRed"><MovementIcon kind="EXIT"/></span><span>Nueva salida</span><span>›</span></Link>
        <Link href="/traspasos/nuevo" className="quickV2 quickPurple"><span className="quickV2Icon tonePurple"><MovementIcon kind="TRANSFER"/></span><span>Nuevo traspaso</span><span>›</span></Link>
      </div>
    </section>
  </div>
}
