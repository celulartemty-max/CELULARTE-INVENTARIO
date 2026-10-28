'use client';
import { useRef,useState } from 'react';
import ReceivingModal from './receiving-modal';

type Preview={revision:string;reference:string;product:string;marking:string;shipping:string;received:number;total:number;pending:number;boxes:string[];blocked:string};
export default function OrderRemoval({sessionId,orderId,busy,onDone}:{sessionId:string;orderId:string;busy:boolean;onDone:(received:number)=>void}) {
    const [open,setOpen]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
    const [preview,setPreview]=useState<Preview|null>(null);const lock=useRef(false);
    async function request(body:Record<string,unknown>) {
        const r=await fetch('/api/receiving',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,sessionId,orderId})});
        const j=await r.json();if(!r.ok)throw new Error(j.error||'No se pudo quitar el pedido.');return j;
    }
    async function inspect() {
        if(lock.current||busy)return;lock.current=true;setOpen(true);setWorking(true);setError('');setPreview(null);
        try{setPreview(await request({action:'removeOrderPreview'}));}
        catch(e){setError(e instanceof Error?e.message:'No se pudo revisar el pedido.');}
        finally{lock.current=false;setWorking(false);}
    }
    return <><button type="button" className="packingDanger" disabled={busy||working} onClick={inspect}>Quitar pedido de esta recepción</button>
        {open&&<ReceivingModal title="Quitar pedido" busy={busy||working} onClose={()=>setOpen(false)}>
            {working&&!preview&&<p role="status">Revisando el pedido…</p>}
            {error&&<p role="alert" className="receivingError">{error}</p>}
            {preview&&<><p><b>{preview.product}</b><br/>{preview.shipping} · {preview.marking} · {preview.received} de {preview.total} cajas</p>
                {preview.blocked?<p role="alert">{preview.blocked}</p>:<form className="receivingCompactForm" onSubmit={async e=>{
                    e.preventDefault();if(lock.current||busy)return;const f=new FormData(e.currentTarget);lock.current=true;setWorking(true);setError('');
                    try{await request({action:'removeOrder',revision:preview.revision,reason:f.get('reason')});setOpen(false);onDone(preview.received);}
                    catch(e){setError(e instanceof Error?e.message:'No se pudo quitar el pedido.');}
                    finally{lock.current=false;setWorking(false);}
                }}>
                    <p>Estas <b>{preview.received} cajas</b> quedarán pendientes de identificar de nuevo. El total físico recibido y los demás pedidos no cambian.</p>
                    {preview.pending>0&&<p>También se anulan los {preview.pending} faltantes previstos de este pedido mal capturado. No cuentan como cajas recibidas.</p>}
                    <details><summary>Ver cajas y referencia</summary><p>{preview.reference}</p><p>Cajas recibidas: {preview.boxes.join(', ')}</p></details>
                    <p>El pedido, su packing y sus archivos se conservan como historial. Los cambios sin guardar en esta pantalla se descartarán.</p>
                    <label className="receivingField">Motivo<textarea name="reason" required minLength={5} maxLength={1000} disabled={busy||working} placeholder="Ej. Se seleccionó el producto equivocado"/></label>
                    <label><input type="checkbox" required disabled={busy||working}/> Confirmo que este pedido está mal capturado y quiero anularlo.</label>
                    <button className="receivingSave" disabled={busy||working}>{working?'Quitando pedido…':'Confirmar y quitar pedido'}</button>
                </form>}
            </>}
            <button type="button" className="receivingSecondary" disabled={busy||working} onClick={()=>setOpen(false)}>Cancelar</button>
        </ReceivingModal>}
    </>;
}
