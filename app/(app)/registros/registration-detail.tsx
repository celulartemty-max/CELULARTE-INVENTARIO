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

export function registrationSubtitle(row:Pick<RegistrationPending,'kind'|'side'|'correction'>){
    const text=registrationInstruction(row).replace('Registrar una ','').toLocaleLowerCase('es-MX');
    return text.charAt(0).toLocaleUpperCase('es-MX')+text.slice(1);
}
export function registrationConfirmLabel(row:Pick<RegistrationPending,'kind'|'side'|'correction'>){
    if(row.correction)return 'Confirmar corrección registrada';
    if(row.kind==='EXIT'||(row.kind==='TRANSFER'&&row.side==='origin'))return 'Confirmar salida registrada';
    if(row.kind.startsWith('RETURN_'))return 'Confirmar devolución registrada';
    return 'Confirmar entrada registrada';
}

export default function RegistrationDetail({detail}:{detail:RegistrationDetailData}){
    const {row,lines}=detail,{complete,total}=registrationQuantities(lines);
    const fmt=(n:number)=>n.toLocaleString('es-MX');
    return <section className="registrationInstructions" aria-label="Qué registrar en sistema">
        <p className="registrationSubtitle">{registrationSubtitle(row)}</p>
        {row.correction&&<p className="registrationCorrection">Corrección: cantidades finales; no dupliques el movimiento.</p>}
        <div className="registrationItemsHeading"><span>Producto</span><span>Piezas</span></div>
        <ul className="registrationItems" aria-label="Productos y cantidades a registrar">{lines.map((line,index)=><li key={index} className="registrationItem"><div className="registrationItemIdentity"><b>{line.product||'Producto sin nombre'}</b>{[line.model,line.color,line.box?`Caja ${line.box}`:''].filter(Boolean).length>0&&<small>{[line.model,line.color,line.box?`Caja ${line.box}`:''].filter(Boolean).join(' · ')}</small>}{line.condition==='DAMAGED'&&<small className="registrationDamaged">Dañado · registrar por separado</small>}</div><strong className="registrationItemQuantity">{typeof line.quantity==='number'&&Number.isFinite(line.quantity)?fmt(line.quantity):'Sin cantidad'}</strong></li>)}</ul>
        <div className="registrationQuantitySummary"><span>Total</span><strong>{total===null?'Por completar':`${fmt(total)} piezas`}</strong></div>
        <details className="registrationMore"><summary>Ver detalles</summary><p>{row.branch}</p><p>Folio: {row.reference}</p><p>La confirmación no envía movimientos automáticamente al sistema.</p></details>
        {!complete&&<p role="alert" className="receivingError">Faltan cantidades. Revisa el movimiento antes de confirmar.</p>}
    </section>;
}
