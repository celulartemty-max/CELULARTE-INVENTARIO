'use client';
type Line={id:string;model:string;color:string;quantity:number};
type Recount={carton_id:string;baseline:Line[];draft?:{id:string;quantity:number}[]|null;adjustments?:{model:string;color:string;delta:number}[]|null;completed_at?:string|null};
export default function RegisteredRecount({boxId,recount,master,canCount,busy,onAction}:{
 boxId:string;recount?:Recount;master:boolean;canCount:boolean;busy:boolean;
 onAction:(action:string,lines?:{id:string;quantity:number}[])=>void;
}){
 if(!recount)return master?<button type="button" disabled={busy} onClick={()=>{if(confirm('¿Autorizar el reconteo de esta caja registrada? El registro original se conservará y las diferencias quedarán pendientes de registrar.'))onAction('authorizeRegisteredRecount')}}>Autorizar reconteo de caja registrada</button>:<p className="receivingMuted">Caja registrada. Solo Máster puede autorizar un reconteo.</p>;
 if(recount.completed_at)return <div role="status"><b>Reconteo terminado · ajustes pendientes de registrar</b>{recount.adjustments?.length?<ul>{recount.adjustments.map((x,i)=><li key={i}>{x.model} · {x.color}: {x.delta>0?'+':''}{x.delta}</li>)}</ul>:<p>Sin diferencias contra el registro anterior.</p>}</div>;
 const saved=new Map((recount.draft??[]).map(x=>[x.id,x.quantity]));
 return <div><p role="status"><b>Reconteo autorizado por Máster.</b> El conteo registrado no se modificará hasta registrar los ajustes.</p>
 {canCount?<form key={boxId+JSON.stringify(recount.draft)} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const lines=recount.baseline.map(x=>({id:x.id,quantity:Number(f.get(x.id))}));if(lines.some(x=>!Number.isInteger(x.quantity)||x.quantity<0))return;const submitter=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;const action=submitter?.value==='save'?'saveRegisteredRecount':'finishRegisteredRecount';if(action==='finishRegisteredRecount'&&!confirm('¿Terminar el reconteo? Se generarán ajustes pendientes contra el conteo original.'))return;onAction(action,lines)}}>
 {recount.baseline.map(x=><label key={x.id} style={{display:'block',marginBottom:12}}>{x.model} · {x.color} <small>(registrado: {x.quantity})</small><input name={x.id} type="number" min="0" max="1000000" step="1" required defaultValue={saved.get(x.id)??x.quantity} disabled={busy}/></label>)}
 <div className="actions"><button type="submit" value="save" disabled={busy}>Guardar avance</button><button type="submit" value="finish" disabled={busy}>Terminar reconteo</button></div>
 </form>:<p className="receivingMuted">Reconteo autorizado. El personal con permiso de conteo puede realizarlo.</p>}
 </div>;
}
