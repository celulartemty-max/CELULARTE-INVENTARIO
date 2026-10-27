'use client';
import { useRef,useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RegistrationPending } from '@/lib/inventory/system-registration';
import ReceivingModal from '../entradas/pedidos/[id]/receiving-modal';
import { preparePhoto } from '../pos-camera-guard';
import '../entradas/pedidos/receiving.css';

const labels:Record<string,string>={RECEIVING:'Recepción por pedidos',DESTINATION:'Cajas recibidas de otra sucursal',RECEPTION:'Recepción',EXIT:'Salida',RETURN_ML:'Devolución ML',RETURN_TIKTOK:'Devolución TikTok',RETURN_CUSTOMER:'Devolución de cliente',TRANSFER:'Traspaso'};
type Detail={row:RegistrationPending;lines:{product?:string;box?:string;model?:string;color?:string;quantity?:number|null;condition?:string}[]};
export default function RegistrationQueue({rows}:{rows:RegistrationPending[]}){
    const router=useRouter(),lock=useRef(false);
    const [busy,setBusy]=useState(false),[refreshing,startTransition]=useTransition(),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const [filter,setFilter]=useState(''),[detail,setDetail]=useState<Detail|null>(null),[photo,setPhoto]=useState<File|null>(null),[confirmed,setConfirmed]=useState(false);
    const disabled=busy||refreshing;
    const visible=rows.filter(r=>!filter||r.kind===filter);
    async function open(row:RegistrationPending){
        if(lock.current||refreshing)return;lock.current=true;setBusy(true);setError('');setNotice('');setPhoto(null);setConfirmed(false);
        try{const q=new URLSearchParams({id:row.id,kind:row.kind});if(row.side)q.set('side',row.side);const r=await fetch('/api/system-registration?'+q);const data=await r.json();if(!r.ok)throw Error(data.error);setDetail(data);}
        catch(e){setError(e instanceof Error?e.message:'No se pudo abrir.')}finally{lock.current=false;setBusy(false)}
    }
    async function save(){
        if(!detail||!confirmed||lock.current||refreshing)return;lock.current=true;setBusy(true);setError('');
        try{
            const {row}=detail;
            if(row.kind!=='RECEIVING'&&row.kind!=='DESTINATION'){
                if(!photo)throw Error('Agrega una foto del registro en sistema.');
                const evidence=await preparePhoto(photo);
                const root=row.kind==='RECEPTION'?'entradas':row.kind==='EXIT'?'salidas':row.kind==='TRANSFER'?'traspasos':'devoluciones';
                const r=await fetch('/api/pos-evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({movementId:row.id,evidence,context:row.side==='destination'?'Registro de destino':'Registro de origen',pathname:`/${root}/${row.id}`})});const data=await r.json();if(!r.ok)throw Error(data.error);
            }
            const r=await fetch('/api/system-registration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id,kind:row.kind,side:row.side})});const data=await r.json();if(!r.ok)throw Error(data.error);
            setDetail(null);setNotice('Registro confirmado. Quedó guardado quién lo registró y cuándo.');startTransition(()=>router.refresh());
        }catch(e){setError(e instanceof Error?e.message:'No se pudo confirmar.')}finally{lock.current=false;setBusy(false)}
    }
    return <><div className="registrationListHeading"><h2>Pendientes <span>{rows.length}</span></h2><label>Tipo<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
        {error&&!detail&&<p role="alert" className="receivingError">{error}</p>}{notice&&<p role="status" className="registrationSuccess">{notice}</p>}
        <div className="registrationList">{visible.map(r=><article className="registrationCard" key={`${r.kind}:${r.id}:${r.side}`}><div><span className="registrationType">{labels[r.kind]}{r.side?` · ${r.side==='origin'?'Origen':'Destino'}`:''}{r.correction?' · Corrección':''}</span><h3>{r.reference}</h3><p>{r.branch}</p><small>{new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'medium'}).format(new Date(r.created_at))}</small></div><button className="registrationPrimary" disabled={disabled} onClick={()=>open(r)}>Ver detalle y registrar →</button></article>)}</div>
        {!visible.length&&<p className="registrationEmpty">✓ No hay registros pendientes{filter?' de este tipo':''}.</p>}
        {detail&&<ReceivingModal title="Confirmar registro en sistema" busy={disabled} onClose={()=>{setDetail(null);setError('')}}><p><b>{detail.row.reference}</b><br/>{detail.row.branch}{detail.row.side?` · ${detail.row.side==='origin'?'Origen':'Destino'}`:''}</p><div className="registrationDetail"><table><thead><tr><th>Producto / modelo</th><th>Piezas</th></tr></thead><tbody>{detail.lines.map((l,i)=><tr key={i}><td><b>{l.product}</b><small>{[l.box?`Caja ${l.box}`:'',l.model,l.color,l.condition==='DAMAGED'?'Dañado':''].filter(Boolean).join(' · ')}</small></td><td>{l.quantity??'—'}</td></tr>)}</tbody></table></div>
            {detail.row.kind!=='RECEIVING'&&detail.row.kind!=='DESTINATION'&&<label className="receivingField">Foto del registro en sistema<input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={e=>setPhoto(e.target.files?.[0]??null)}/>{photo&&<small>{photo.name}</small>}</label>}
            <label className="registrationConfirm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>Ya registré estas cantidades en el sistema de esta sucursal.</label>
            {error&&<p role="alert" className="receivingError">{error}</p>}
            <button className="receivingSave" disabled={disabled||!confirmed||(detail.row.kind!=='RECEIVING'&&detail.row.kind!=='DESTINATION'&&!photo)} onClick={save}>{disabled?'Guardando…':'Confirmar registro'}</button><p className="receivingMuted">Esto guarda tu confirmación; no envía movimientos automáticamente.</p>
        </ReceivingModal>}
    </>;
}
