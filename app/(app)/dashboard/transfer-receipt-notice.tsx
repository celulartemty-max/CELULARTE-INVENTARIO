import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { pendingTransferReceipts } from '@/lib/inventory/transfer-receipts';
import type { SessionUser } from '@/lib/auth/types';

export default async function TransferReceiptNotice(){
    const rows=await pendingTransferReceipts(await requireUser());
    if(!rows.length)return null;
    const single=rows.length===1;
    return <Link href={single?`/traspasos/${rows[0].id}`:'/movimientos?view=transfers-receive'} className="transferReceiptNotice" aria-label={`${rows.length} traspasos por recibir. ${single?'Ver traspaso':'Ver pendientes'}`}>
        <span className="transferReceiptIcon" aria-hidden="true">📦</span>
        <span className="transferReceiptText"><b>{single?'Tienes un traspaso por recibir':`Tienes ${rows.length} traspasos por recibir`}</b><small>{single?`${rows[0].origin} → ${rows[0].destination}`:'Confirma las cantidades que llegaron a tus sucursales.'}</small><span className="transferReceiptAction">{single?'Ver traspaso':'Ver pendientes'} →</span></span>
        <span className="transferReceiptBadge" aria-hidden="true">{rows.length}</span>
    </Link>;
}

export async function TransferReceiptList({user}:{user:SessionUser}){
    const rows=await pendingTransferReceipts(user);
    return <div className="dashboardV2"><Link href="/dashboard">← Inicio</Link><section className="dashTop"><div className="dashGreeting"><h1>Traspasos por recibir</h1><p>Primero confirma la recepción física. Después podrás registrar en sistema.</p></div></section>
        <div className="recentV2">{rows.length?rows.map(row=><Link className="recentV2Row" href={`/traspasos/${row.id}`} key={row.id}><span className="recentV2Icon tonePurple" aria-hidden="true">📦</span><span className="recentV2Text"><b>{row.folio}</b><small>{row.origin} → {row.destination}</small><small>Ver traspaso y confirmar recepción</small></span><span className="recentV2Arrow" aria-hidden="true">›</span></Link>):<p className="dashEmpty">✓ No tienes traspasos pendientes de recepción.</p>}</div>
    </div>;
}
