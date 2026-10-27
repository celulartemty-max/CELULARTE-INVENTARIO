import type { RegistrationPending } from '@/lib/inventory/system-registration';

export type RegistrationLine={product?:string;box?:string;model?:string;color?:string;quantity?:number|null;condition?:string};
export type RegistrationDetailData={row:RegistrationPending;lines:RegistrationLine[]};

export function registrationInstruction(row:Pick<RegistrationPending,'kind'|'side'|'correction'>){
    if(row.kind==='TRANSFER')return row.side==='origin'?'Registrar una SALIDA por traspaso':'Registrar una ENTRADA por traspaso';
    if(row.kind==='EXIT')return 'Registrar una SALIDA';
    if(row.kind.startsWith('RETURN_'))return 'Registrar una DEVOLUCIÓN';
    return 'Registrar una ENTRADA';
}
export function registrationQuantities(lines:RegistrationLine[]){
    const complete=lines.length>0&&lines.every(line=>typeof line.quantity==='number'&&Number.isFinite(line.quantity)&&Number.isInteger(line.quantity)&&line.quantity>=0);
    return {complete,total:complete?lines.reduce((sum,line)=>sum+line.quantity!,0):null};
}

export default function RegistrationDetail({detail}:{detail:RegistrationDetailData}){
    const {row,lines}=detail,{complete,total}=registrationQuantities(lines);
    const fmt=(n:number)=>n.toLocaleString('es-MX');
    return <section className="registrationInstructions" aria-label="Qué registrar en sistema">
        <div className="registrationMovement"><span>QUÉ VAS A REGISTRAR</span><h3>{registrationInstruction(row)}</h3><p>En <b>{row.branch}</b></p><small>Folio: {row.reference}</small>
            {row.correction&&<p className="registrationCorrection">Corrección de un registro anterior. Estas son las cantidades finales: no dupliques el movimiento.</p>}
        </div>
        <div className="registrationQuantitySummary"><span>Total a registrar</span><strong>{total===null?'Por completar':`${fmt(total)} piezas`}</strong></div>
        <p className="registrationInstructionsNote">Registra estos productos y cantidades en el sistema de la sucursal. Después adjunta la evidencia cuando se solicite y confirma abajo.</p>
        <ul className="registrationItems" aria-label="Productos y cantidades a registrar">{lines.map((line,index)=><li key={index} className="registrationItem"><div className="registrationItemIdentity"><b>{line.product||'Producto sin nombre'}</b>{line.model&&<small>Modelo: {line.model}</small>}{line.color&&<small>Color: {line.color}</small>}{line.box&&<small>Caja {line.box}</small>}{line.condition==='DAMAGED'&&<small className="registrationDamaged">Dañado · registrar por separado</small>}</div><div className="registrationItemQuantity"><strong>{typeof line.quantity==='number'&&Number.isFinite(line.quantity)?fmt(line.quantity):'Sin cantidad'}</strong><span>piezas</span></div></li>)}</ul>
        {!complete&&<p role="alert" className="receivingError">Faltan cantidades para mostrar un resumen completo. Revisa el movimiento antes de confirmar.</p>}
    </section>;
}
