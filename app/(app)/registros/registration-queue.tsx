'use client';
import { useRef,useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RegistrationPending } from '@/lib/inventory/system-registration';
import RegistrationDetail,{registrationQuantities,registrationConfirmLabel,type RegistrationDetailData} from './registration-detail';
import ReceivingModal from '../entradas/pedidos/[id]/receiving-modal';
import { preparePhoto } from '../pos-camera-guard';
import '../entradas/pedidos/receiving.css';
import './registration.css';

const labels:Record<string,string>={RECEIVING:'Recepción por pedidos',DESTINATION:'Cajas recibidas de otra sucursal',RECEPTION:'Recepción',EXIT:'Salida',RETURN_ML:'Devolución ML',RETURN_TIKTOK:'Devolución TikTok',RETURN_CUSTOMER:'Devolución de cliente',TRANSFER:'Traspaso'};
type Detail=RegistrationDetailData;
export default function RegistrationQueue({rows,compact=false,buttonLabel='Ver detalle y registrar →'}:{rows:RegistrationPending[];compact?:boolean;buttonLabel?:string}){
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
        if(!detail||!confirmed||!registrationQuantities(detail.lines).complete||lock.current||refreshing)return;lock.current=true;setBusy(true);setError('');
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
    return <>{!compact&&<div className="registrationListHeading"><h2>Pendientes <span>{rows.length}</span></h2><label>Tipo<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>}
        {error&&!detail&&<p role="alert" className="receivingError">{error}</p>}{notice&&<p role="status" className="registrationSuccess">{notice}</p>}
        {!compact&&<div className="registrationList">{visible.map(r=><article className="registrationCard" key={`${r.kind}:${r.id}:${r.side}`}><div><span className="registrationType">{labels[r.kind]}{r.side?` · ${r.side==='origin'?'Origen':'Destino'}`:''}{r.correction?' · Corrección':''}</span><h3>{r.branch.toLocaleUpperCase('es-MX')}</h3><p>Folio: {r.reference}</p><small>{new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'medium'}).format(new Date(r.created_at))}</small></div><button className="registrationPrimary" disabled={disabled} onClick={()=>open(r)}>Ver detalle y registrar →</button></article>)}</div>}
        {!compact&&!visible.length&&<p className="registrationEmpty">✓ No hay registros pendientes{filter?' de este tipo':''}.</p>}
        {compact&&visible.map(r=><button type="button" className="registrationPrimary" style={{width:'100%'}} key={`${r.kind}:${r.id}:${r.side}`} disabled={disabled} onClick={()=>open(r)}>{busy?'Abriendo…':buttonLabel}</button>)}
        {detail&&<ReceivingModal className="registrationModal" title={detail.row.branch.toLocaleUpperCase('es-MX')} busy={disabled} onClose={()=>{setDetail(null);setError('')}}><RegistrationDetail detail={detail}/>
            {detail.row.kind!=='RECEIVING'&&detail.row.kind!=='DESTINATION'&&<label className="registrationEvidence"><span>{photo?'✓ Comprobante listo · Cambiar':'＋ Agregar comprobante'}</span><input aria-label="Foto del registro en sistema" type="file" accept="image/*" disabled={disabled} onChange={e=>{const selected=e.target.files?.[0];if(selected)setPhoto(selected)}}/></label>}
            <label className="registrationConfirm"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>Ya lo registré en sistema.</label>
            {error&&<p role="alert" className="receivingError">{error}</p>}
            <button className="receivingSave" disabled={disabled||!confirmed||!registrationQuantities(detail.lines).complete||(detail.row.kind!=='RECEIVING'&&detail.row.kind!=='DESTINATION'&&!photo)} onClick={save}>{disabled?'Guardando…':registrationConfirmLabel(detail.row)}</button>
        </ReceivingModal>}
    </>;
}
