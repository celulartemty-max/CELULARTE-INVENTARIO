'use client';
import RegistrationQueue from '../../registros/registration-queue';
import type {Transfer,TransferLine} from './transfer-editor';
import './transfer-final.css';

export default function TransferFinal({transfer:t,lines,canOrigin,canDestination,canRegister}:{transfer:Transfer;lines:TransferLine[];canOrigin:boolean;canDestination:boolean;canRegister:boolean}){
    const external=!t.destinationInternal,complete=t.status==='COMPLETED';
    const money=(n:number)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
    return <section className="transferFinalCompact">
        <header><h1>{t.origin} → {t.destination}</h1><p>{complete?'✓ Registro completado':external?'Enviado a sucursal externa':t.received_at?'✓ Recepción confirmada':'Pendiente de registro'}</p></header>
        <div className="transferFinalColumns" aria-hidden="true"><span>Producto</span><span>{external?'Piezas enviadas':'Piezas recibidas'}</span></div>
        <ul className="transferFinalProducts">{lines.map(l=><li key={l.id}><div><b>{l.product}</b>{t.transferKind==='SALE'&&l.saleAmount!==null&&<small>{money(l.saleAmount)}</small>}</div><strong>{(external?l.sentQuantity:l.receivedQuantity)?.toLocaleString('es-MX')??'Sin cantidad'}</strong></li>)}</ul>
        {t.transferKind==='SALE'&&<p className="transferFinalSale">Total de venta <b>{money(lines.reduce((sum,l)=>sum+(l.saleAmount??0),0))}</b></p>}
        <section className="transferFinalRegistrations" aria-label="Registro en sistema"><h2>Registro en sistema</h2>
            <RegistrationRow transfer={t} side="origin" allowed={canOrigin} canRegister={canRegister}/>
            {!external&&<RegistrationRow transfer={t} side="destination" allowed={canDestination} canRegister={canRegister}/>}
            {!canRegister&&!complete&&<small className="transferFinalNote">Solo consulta · Requiere permiso de Registro en sistema.</small>}
        </section>
        <details className="transferFinalDetails"><summary>Ver detalles</summary><p>Folio: {t.folio}</p>{external&&<p>El destino externo no confirma recepción ni registro en esta app.</p>}</details>
    </section>;
}

function RegistrationRow({transfer:t,side,allowed,canRegister}:{transfer:Transfer;side:'origin'|'destination';allowed:boolean;canRegister:boolean}){
    const origin=side==='origin',branch=origin?t.origin:t.destination,done=Boolean(origin?t.origin_pos_registered_at:t.destination_pos_registered_at);
    const pending=t.status==='PENDING_POS'&&!done,enabled=pending&&allowed&&canRegister;
    const description=origin?(done?'Salida registrada':'Salida pendiente'):(done?'Entrada registrada':'Entrada pendiente');
    return <div className="transferFinalRow"><div><b>{branch}</b><small className={done?'transferFinalDone':''}>{done?'✓ ':''}{description}</small></div>
        {enabled?<div className="transferFinalAction"><RegistrationQueue compact buttonLabel="Confirmar" rows={[{id:t.id,kind:'TRANSFER',side,branch_id:origin?t.origin_branch_id:t.destination_branch_id,branch,reference:t.folio,created_at:t.sent_at||'',correction:false}]}/></div>:pending&&allowed?<button disabled className="transferFinalDisabled">Confirmar</button>:pending?<small className="transferFinalNote">Solo consulta</small>:null}
    </div>;
}
