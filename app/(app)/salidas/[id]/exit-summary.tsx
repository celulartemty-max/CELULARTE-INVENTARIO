'use client';
import RegistrationQueue from '../../registros/registration-queue';
import type {ExitMovement,ExitLine} from './exit-editor';
import './exit-summary.css';

export default function ExitSummary({movement:m,lines,canRegister}:{movement:ExitMovement;lines:ExitLine[];canRegister:boolean}){
    const correction=m.status==='POS_CORRECTION_PENDING';
    const pending=correction||(['CLOSED','PENDING_POS'].includes(m.status)&&!m.pos_registered_at);
    const cancelled=m.status==='CANCELLED';
    const registered=!cancelled&&!correction&&(Boolean(m.pos_registered_at)||['POS_REGISTERED','POS_RECONCILED'].includes(m.status));
    const valid=lines.length>0&&lines.every(l=>Number.isInteger(l.quantity)&&l.quantity>=0);
    const total=valid?lines.reduce((sum,l)=>sum+l.quantity,0):null;
    const channel:Record<string,string>={MERCADO_LIBRE:'Mercado Libre',TIKTOK:'TikTok',OTHER:'Otro'};
    const type:Record<string,string>={FULL:'Full',INDEPENDENT_SALE:'Venta independiente'};
    return <section className="exitSummaryCompact">
        <header><h1>{m.branch.toLocaleUpperCase('es-MX')}</h1><p>Salida · {channel[m.channel]??m.channel} · {type[m.exit_type]??m.exit_type}</p></header>
        <div className="exitSummaryColumns" aria-hidden="true"><span>Producto</span><span>Piezas</span></div>
        <ul className="exitSummaryProducts">{lines.map(l=><li key={l.id}><b>{l.product}</b><strong>{Number.isInteger(l.quantity)&&l.quantity>=0?l.quantity.toLocaleString('es-MX'):'Sin cantidad'}</strong></li>)}</ul>
        <div className="exitSummaryTotal"><span>Total</span><strong>{total===null?'Por completar':`${total.toLocaleString('es-MX')} piezas`}</strong></div>
        <div className="exitSummaryRegistration"><span className={registered?'exitSummaryDone':''}>{cancelled?'Salida cancelada':registered?'✓ Salida registrada':correction?'Corrección pendiente':pending?'Salida pendiente de registro':'Estado no disponible'}</span>
            {pending&&canRegister?<RegistrationQueue compact buttonLabel={correction?'Confirmar corrección registrada':'Confirmar salida registrada'} rows={[{id:m.id,kind:'EXIT',side:null,branch_id:m.branch_id,branch:m.branch,reference:m.folio,created_at:'',correction}]}/>:pending?<small>Solo consulta · Requiere permiso de Registro en sistema.</small>:null}
        </div>
        <details className="exitSummaryDetails"><summary>Ver detalles</summary><p>Folio: {m.folio}</p></details>
    </section>;
}
