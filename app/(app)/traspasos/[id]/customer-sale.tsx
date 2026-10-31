'use client';
import type {Transfer,TransferLine} from './transfer-editor';
import TransferReceipt from './transfer-receipt';
import RegistrationQueue from '../../registros/registration-queue';
import './transfer-final.css';

export default function CustomerSale({transfer:t,lines,canOrigin,canDestination,canRegister,onAdd,act}:{transfer:Transfer;lines:TransferLine[];canOrigin:boolean;canDestination:boolean;canRegister:boolean;onAdd:()=>void;act:(body:Record<string,unknown>,message?:string)=>Promise<void>}){
 const draft=t.status==='DRAFT',done=t.status==='COMPLETED',paid=Boolean(t.paidAt);
 const date=(s?:string|null)=>s?new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(s)):'';
 const paidBranch=t.paidBranchId===t.origin_branch_id?t.origin:t.destination;
 return <section className="transferFinalCompact">
  <header><h1>{t.origin} → {t.destination}</h1><p>Venta con entrega</p></header>
  <ul className="transferFinalProducts">{lines.map(l=><li key={l.id}><div><b>{l.product}</b>{draft&&canOrigin&&!paid&&<button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Quitar este producto?')}>Eliminar</button>}</div><strong>{l.sentQuantity} piezas</strong></li>)}</ul>
  {draft&&canOrigin&&!paid&&<button onClick={onAdd} style={{minHeight:44}}>+ Agregar producto</button>}
  {draft&&canOrigin&&<button disabled={!lines.length} className="primary" style={{width:'100%',minHeight:44,marginTop:12}} onClick={()=>act({action:'send'},'¿Confirmar el envío para venta al cliente? No genera baja por traspaso ni alta en destino.')}>Confirmar envío</button>}
  <section className="transferFinalRegistrations" aria-label="Estado de la venta">
   <div className="transferFinalRow"><div><b>{t.received_at?'✓ Recibido en ':'Recepción · '}{t.destination}</b><small>{t.received_at?`${t.receivedBy||''} · ${date(t.received_at)}`:'Pendiente de recibir'}</small></div></div>
   {t.status==='WAITING_RECEIPT'&&<TransferReceipt transfer={t} lines={lines} canReceive={canDestination} onReceive={receivedLines=>act({action:'receive',lines:receivedLines},'¿Confirmar la recepción física? No se debe dar entrada en el sistema de inventario.')}/>}
   <div className="transferFinalRow"><div><b>{paid?'✓ Pago recibido':'Pago del cliente'}</b>{!paid&&!canDestination&&<small>Pendiente en {t.destination}</small>}</div></div>
   {!paid&&!done&&lines.length>0&&canDestination&&<button style={{minHeight:44,width:'100%'}} onClick={()=>act({action:'paid',branchId:t.destination_branch_id},`¿Confirmas que ${t.destination} recibió el pago completo del cliente? Los productos quedarán bloqueados para edición.`)}>Confirmar pago recibido</button>}
   <div className="transferFinalRow"><div><b>{t.origin_pos_registered_at?'✓ Venta registrada':'Venta en sistema'} · {t.origin}</b>{!t.origin_pos_registered_at&&<small>{!paid?'Pendiente de confirmar el pago':!t.sent_at?'Pendiente de confirmar el envío':'Pendiente de registrar'}</small>}</div></div>
   {!t.origin_pos_registered_at&&paid&&t.sent_at&&canOrigin&&canRegister&&<RegistrationQueue compact buttonLabel="Confirmar venta en sistema" rows={[{id:t.id,kind:'CLIENT_SALE',side:'origin',branch_id:t.origin_branch_id,branch:t.origin,reference:t.folio,created_at:t.sent_at,correction:false}]}/>}
  </section>
  {done&&<p>✓ Movimiento completado.</p>}<details className="transferFinalDetails"><summary>Ver detalles</summary><p>Folio: {t.folio}</p><p>Sin baja por traspaso ni alta en destino.</p>{t.received_at&&<p>Recepción: {t.destination} · {t.receivedBy||'Usuario'} · {date(t.received_at)}</p>}{paid&&<p>Pago: {paidBranch} · {t.paidBy||'Usuario'} · {date(t.paidAt)}</p>}{t.origin_pos_registered_at&&<p>Venta: {t.origin} · {t.registeredBy||'Usuario'} · {date(t.origin_pos_registered_at)}</p>}</details>
 </section>;
}
