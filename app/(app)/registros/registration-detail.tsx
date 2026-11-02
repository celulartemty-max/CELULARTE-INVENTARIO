import type { RegistrationPending } from '@/lib/inventory/system-registration';

export type RegistrationLine={product?:string;product_id?:string;carton_id?:string;box?:string;model?:string;color?:string;quantity?:number|null;condition?:string};
export type RegistrationDetailData={row:RegistrationPending;lines:RegistrationLine[]};

export function registrationInstruction(row:Pick<RegistrationPending,'kind'|'side'|'correction'>){
    if(row.kind==='CLIENT_SALE')return 'Registrar una VENTA en la sucursal de origen';
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
    if(row.kind==='CLIENT_SALE')return 'Confirmar venta registrada';
    if(row.correction)return 'Confirmar corrección registrada';
    if(row.kind==='EXIT'||(row.kind==='TRANSFER'&&row.side==='origin'))return 'Confirmar salida registrada';
    if(row.kind.startsWith('RETURN_'))return 'Confirmar devolución registrada';
    return 'Confirmar entrada registrada';
}

export default function RegistrationDetail({detail}:{detail:RegistrationDetailData}){
    const {row,lines}=detail,{complete,total}=registrationQuantities(lines);
    const grouped=['RECEIVING','DESTINATION','RECEPTION'].includes(row.kind);
    const groups=new Map<string,{product:string;boxes:Set<string>;lines:RegistrationLine[]}>();
    if(grouped)for(const line of lines){
        const key=line.product_id||line.product||'Producto sin nombre';
        const group=groups.get(key)||{product:line.product||'Producto sin nombre',boxes:new Set<string>(),lines:[]};
        if(line.carton_id||line.box)group.boxes.add(line.carton_id||line.box!);
        group.lines.push(line);groups.set(key,group);
    }
    const fmt=(n:number)=>n.toLocaleString('es-MX');
    return <section className="registrationInstructions" aria-label="Qué registrar en sistema">
        <p className="registrationSubtitle">{registrationSubtitle(row)}</p>
        {row.correction&&<p className="registrationCorrection">Corrección: cantidades finales; no dupliques el movimiento.</p>}
        {grouped&&<><div className="registrationItemsHeading registrationGrouped"><span>Producto</span><span># Cajas</span><span># Piezas</span></div><ul className="registrationItems" aria-label="Resumen por producto">{Array.from(groups,([key,group])=>{const q=registrationQuantities(group.lines);return <li className="registrationItem registrationGrouped" key={key}><div className="registrationItemIdentity"><b>{group.product}</b></div><strong className="registrationItemQuantity">{group.boxes.size}</strong><strong className="registrationItemQuantity">{q.total===null?'Por completar':fmt(q.total)}</strong></li>})}</ul></>}
        {!grouped&&<><div className="registrationItemsHeading"><span>Producto</span><span>Piezas</span></div>
        <ul className="registrationItems" aria-label="Productos y cantidades a registrar">{lines.map((line,index)=><li key={index} className="registrationItem"><div className="registrationItemIdentity"><b>{line.product||'Producto sin nombre'}</b>{[line.model,line.color,line.box?`Caja ${line.box}`:''].filter(Boolean).length>0&&<small>{[line.model,line.color,line.box?`Caja ${line.box}`:''].filter(Boolean).join(' · ')}</small>}{line.condition==='DAMAGED'&&<small className="registrationDamaged">Dañado · registrar por separado</small>}</div><strong className="registrationItemQuantity">{typeof line.quantity==='number'&&Number.isFinite(line.quantity)?fmt(line.quantity):'Sin cantidad'}</strong></li>)}</ul>
        </>}
        <div className="registrationQuantitySummary"><span>Total{grouped?` · ${new Set(lines.map(l=>l.carton_id||l.box).filter(Boolean)).size} cajas`:''}</span><strong>{total===null?'Por completar':`${fmt(total)} piezas`}</strong></div>
        <details className="registrationMore"><summary>Ver detalles</summary><p>{row.branch}</p><p>Folio: {row.reference}</p>{grouped&&lines.map((line,index)=><p key={index}><b>{line.product}</b> · {[line.model,line.color,line.box?`Caja ${line.box}`:''].filter(Boolean).join(' · ')} · {typeof line.quantity==='number'?fmt(line.quantity):'Sin cantidad'} piezas</p>)}<p>La confirmación no envía movimientos automáticamente al sistema.</p></details>
        {!complete&&<p role="alert" className="receivingError">Faltan cantidades. Revisa el movimiento antes de confirmar.</p>}
    </section>;
}
