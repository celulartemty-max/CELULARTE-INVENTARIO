import Link from "next/link";
import { requireUser, getAuthorizedBranchIds } from "@/lib/auth/authorization";
import { sql } from "@/lib/db";

const fmt=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Monterrey",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const receptionDateFmt=new Intl.DateTimeFormat("es-MX",{timeZone:"America/Monterrey",day:"numeric",month:"long"});
const detail=(id:string,type:string)=>type==='RECEPTION'?`/entradas/${id}`:type.startsWith('RETURN_')?`/devoluciones/${id}`:type==='EXIT'?`/salidas/${id}`:type==='TRANSFER'?`/traspasos/${id}`:'#';
const typeLabel=(v:string)=>({RECEPTION:'Recepción',RETURN_ML:'Devolución Mercado Libre',RETURN_TIKTOK:'Devolución TikTok',RETURN_CUSTOMER:'Devolución de cliente',EXIT:'Salida',TRANSFER:'Traspaso'}[v]??v);
const tone=(v:string)=>v==='EXIT'?'toneRed':v==='TRANSFER'?'tonePurple':v.startsWith('RETURN_')?'toneGreen':'toneBlue';
const statusLabel=(v:string)=>({DRAFT:'En captura',CLOSED:'Captura terminada',PENDING_POS:'Pendiente de registrar',POS_REGISTERED:'Registrado en sistema',POS_CORRECTION_PENDING:'Corrección pendiente',POS_RECONCILED:'Registrado en sistema',CANCELLED:'Cancelado',WAITING_RECEIPT:'Esperando recepción',RECEIVED_WITH_DIFFERENCES:'Recibido con diferencias',COMPLETED:'Completado'}[v]??v);

type IconKind='RECEPTION'|'RETURN'|'EXIT'|'TRANSFER';
function MovementIcon({kind}:{kind:IconKind}){
  const common={width:26,height:26,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true};
  if(kind==='RECEPTION')return <svg {...common}><path d="M4.5 8.2 12 4l7.5 4.2v8.4L12 21l-7.5-4.4Z"/><path d="m4.8 8.4 7.2 4.1 7.2-4.1M12 12.5V21"/><path d="M12 2v6m0 0-2.2-2.2M12 8l2.2-2.2"/></svg>;
  if(kind==='RETURN')return <svg {...common}><path d="M8 7H5V4"/><path d="M5.4 7A8 8 0 1 1 4 14"/><path d="M9 10.2 12 8.5l3 1.7v3.6L12 15.5l-3-1.7Z"/><path d="m9.2 10.3 2.8 1.6 2.8-1.6"/></svg>;
  if(kind==='EXIT')return <svg {...common}><path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4M17 12H9"/></svg>;
  return <svg {...common}><path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3"/></svg>;
}
const iconKind=(v:string):IconKind=>v==='EXIT'?'EXIT':v==='TRANSFER'?'TRANSFER':v.startsWith('RETURN_')?'RETURN':'RECEPTION';

export default async function MovimientosPage(){
  const user=await requireUser();
  const branches=await getAuthorizedBranchIds(user);
  const rows=branches===null
    ?await sql`SELECT m.id,m.folio,m.movement_type::text type,CASE WHEN m.movement_type='TRANSFER' THEN t.status::text ELSE m.status::text END status,m.created_at,CASE WHEN m.movement_type='TRANSFER' THEN ob.name||' → '||db.name ELSE b.name END branch,u.name user_name,p.name product_name,r.expected_boxes FROM inventory_movements m JOIN branches b ON b.id=m.branch_id JOIN users u ON u.id=m.created_by LEFT JOIN receptions r ON r.movement_id=m.id LEFT JOIN products p ON p.id=r.product_id LEFT JOIN transfers t ON t.movement_id=m.id LEFT JOIN branches ob ON ob.id=t.origin_branch_id LEFT JOIN branches db ON db.id=t.destination_branch_id ORDER BY m.created_at DESC`
    :branches.length===0?[]:await sql`SELECT m.id,m.folio,m.movement_type::text type,CASE WHEN m.movement_type='TRANSFER' THEN t.status::text ELSE m.status::text END status,m.created_at,CASE WHEN m.movement_type='TRANSFER' THEN ob.name||' → '||db.name ELSE b.name END branch,u.name user_name,p.name product_name,r.expected_boxes FROM inventory_movements m JOIN branches b ON b.id=m.branch_id JOIN users u ON u.id=m.created_by LEFT JOIN receptions r ON r.movement_id=m.id LEFT JOIN products p ON p.id=r.product_id LEFT JOIN transfers t ON t.movement_id=m.id LEFT JOIN branches ob ON ob.id=t.origin_branch_id LEFT JOIN branches db ON db.id=t.destination_branch_id WHERE (m.movement_type<>'TRANSFER' AND m.branch_id=ANY(${branches}::uuid[])) OR (m.movement_type='TRANSFER' AND (t.origin_branch_id=ANY(${branches}::uuid[]) OR t.destination_branch_id=ANY(${branches}::uuid[]))) ORDER BY m.created_at DESC`;

  return <div className="dashboardV2" style={{paddingBottom:24}}>
    <section className="dashTop" style={{marginBottom:18}}>
      <div className="dashGreeting"><h1>Movimientos</h1><p>Historial completo · {rows.length} movimiento{rows.length===1?'':'s'}</p></div>
    </section>

    <section className="dashSection" style={{marginTop:0}}>
      <div className="recentV2 recentV2Full">{rows.length===0?<div className="dashEmpty">Aún no hay movimientos para mostrar.</div>:rows.map(r=>{const id=String(r.id),type=String(r.type),status=String(r.status??'');const isReception=type==='RECEPTION'&&r.product_name;const title=isReception?String(r.product_name):typeLabel(type);const baseMeta=isReception?`${receptionDateFmt.format(new Date(String(r.created_at)))} · ${Number(r.expected_boxes)} caja${Number(r.expected_boxes)===1?'':'s'} · ${String(r.branch)}`:`${String(r.folio)} · ${String(r.branch)}`;const meta=`${baseMeta} · ${statusLabel(status)}`;return <Link href={detail(id,type)} className="recentV2Row" key={id}><span className={`recentV2Icon ${tone(type)}`}><MovementIcon kind={iconKind(type)}/></span><span className="recentV2Text"><b>{title}</b><small>{meta}</small></span><span className="recentV2Date">{fmt.format(new Date(String(r.created_at)))}</span><span className="recentV2Arrow">›</span></Link>})}</div>
    </section>
  </div>;
}
