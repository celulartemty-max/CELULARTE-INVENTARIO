'use client';
import {useState} from 'react';
import type {Transfer,TransferLine} from './transfer-editor';
import TransferReceipt from './transfer-receipt';
import RegistrationQueue from '../../registros/registration-queue';
import './transfer-final.css';

export default function CustomerSale({transfer:t,lines,canOrigin,canDestination,canRegister,onAdd,act}:{transfer:Transfer;lines:TransferLine[];canOrigin:boolean;canDestination:boolean;canRegister:boolean;onAdd:()=>void;act:(body:Record<string,unknown>,message?:string)=>Promise<void>}){
 const[branch,setBranch]=useState(canOrigin?t.origin_branch_id:t.destination_branch_id);
 const draft=t.status==='DRAFT',done=t.status==='COMPLETED',paid=Boolean(t.paidAt);
 const date=(s?:string|null)=>s?new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'short',timeStyle:'short'}).format(new Date(s)):'';
 const paidBranch=t.paidBranchId===t.origin_branch_id?t.origin:t.destination;
 return <section className="transferFinalCompact">
  <header><h1>{t.origin} → {t.destination}</h1><p>Venta con entrega en otra sucursal</p><p>Sin baja por traspaso ni alta en destino. Venta en sistema: {t.origin}.</p></header>
  <ul className="transferFinalProducts">{lines.map(l=><li key={l.id}><div><b>{l.product}</b>{draft&&canOrigin&&!paid&&<button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Quitar este producto?')}>Eliminar</button>}</div><strong>{l.sentQuantity} piezas</strong></li>)}</ul>
  {draft&&canOrigin&&!paid&&<button onClick={onAdd} style={{minHeight:44}}>+ Agregar producto</button>}
  {draft&&canOrigin&&<button disabled={!lines.length} className="primary" style={{width:'100%',minHeight:44,marginTop:12}} onClick={()=>act({action:'send'},'¿Confirmar el envío para venta al cliente? No genera baja por traspaso ni alta en destino.')}>Confirmar envío</button>}
  <section className="transferFinalRegistrations"><h2>Confirmaciones</h2>
   <div className="transferFinalRow"><div><b>Recibido en sucursal</b><small>{t.received_at?`✓ ${t.destination} · ${t.receivedBy||''} · ${date(t.received_at)}`:'Pendiente en '+t.destination}</small></div></div>
   {t.status==='WAITING_RECEIPT'&&<TransferReceipt transfer={t} lines={lines} canReceive={canDestination} onReceive={receivedLines=>act({action:'receive',lines:receivedLines},'¿Confirmar la recepción física? No se debe dar entrada en el sistema de inventario.')}/>}
   <div className="transferFinalRow"><div><b>Pagada por el cliente</b><small>{paid?`✓ ${paidBranch} · ${t.paidBy||''} · ${date(t.paidAt)}`:'Puede confirmarse antes o después de recibir las piezas.'}</small></div></div>
   {!paid&&!done&&lines.length>0&&(canOrigin||canDestination)&&<div style={{display:'grid',gap:8}}><label>Sucursal que recibió el pago<select style={{width:'100%'}} value={branch} onChange={e=>setBranch(e.target.value)}>{canOrigin&&<option value={t.origin_branch_id}>{t.origin}</option>}{canDestination&&<option value={t.destination_branch_id}>{t.destination}</option>}</select></label><button style={{minHeight:44}} onClick={()=>act({action:'paid',branchId:branch},'¿Confirmas que el cliente ya pagó todo el pedido? Los productos quedarán bloqueados para edición.')}>Confirmar pago del cliente</button></div>}
   <div className="transferFinalRow"><div><b>Venta registrada en sistema</b><small>{t.origin_pos_registered_at?`✓ ${t.origin} · ${t.registeredBy||''} · ${date(t.origin_pos_registered_at)}`:`Corresponde únicamente a ${t.origin}.`}</small></div></div>
   {!t.origin_pos_registered_at&&paid&&t.sent_at&&canOrigin&&canRegister&&<RegistrationQueue compact buttonLabel="Confirmar venta en sistema" rows={[{id:t.id,kind:'CLIENT_SALE',side:'origin',branch_id:t.origin_branch_id,branch:t.origin,reference:t.folio,created_at:t.sent_at,correction:false}]}/>}
   {!t.origin_pos_registered_at&&(!paid||!t.sent_at)&&<p>Para registrar la venta, primero confirma el pago y el envío.</p>}
  </section>
  {done&&<p>✓ Movimiento completado.</p>}<details><summary>Ver folio</summary><p>{t.folio}</p></details>
 </section>;
}
