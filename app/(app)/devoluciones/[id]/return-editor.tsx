"use client";

import {useState} from 'react';
import type {AppRole} from '@/lib/auth/types';

export type ReturnMovement={id:string;folio:string;branch_id:string;branch:string;origin:string;status:string;pos_registered_at:string|null;current_version:number};
export type ReturnLine={id:string;productId:string;colorId:string;model:string;quantity:number;condition:string;reason:string;product:string;color:string};
export type Evidence={slot:number;fileUrl:string};
export type ReturnProduct={id:string;name:string;colors:{id:string;name:string}[]};

const origins:Record<string,string>={RETURN_ML:'Mercado Libre',RETURN_TIKTOK:'TikTok',RETURN_CUSTOMER:'Cliente'};
const conditions:Record<string,string>={GOOD:'Buen estado',DAMAGED:'Dañado',INCOMPLETE:'Incompleto',WRONG_PRODUCT:'Producto incorrecto'};
const statusLabels:Record<string,string>={DRAFT:'En captura',CLOSED:'Captura terminada',PENDING_POS:'Pendiente de registrar',POS_REGISTERED:'Registrado en sistema',POS_CORRECTION_PENDING:'Corrección pendiente',POS_RECONCILED:'Registrado en sistema',CANCELLED:'Cancelada'};

export default function ReturnEditor({movement,lines,evidence,products,role}:{movement:ReturnMovement;lines:ReturnLine[];evidence:Evidence[];products:ReturnProduct[];role:AppRole}){
  const editable=movement.status==='DRAFT'||(role==='MASTER'&&movement.status!=='CANCELLED');
  const [capture,setCapture]=useState(movement.status==='DRAFT'&&lines.length===0);
  const [product,setProduct]=useState('');
  const total=lines.reduce((s,l)=>s+l.quantity,0);
  const posPending=movement.status==='POS_CORRECTION_PENDING'||(movement.status!=='DRAFT'&&!movement.pos_registered_at&&movement.status!=='CANCELLED');
  const canRegisterPos=role==='MASTER'||role==='MANAGER';

  async function act(body:Record<string,unknown>,msg?:string){
    if(msg&&!confirm(msg))return false;
    const r=await fetch('/api/returns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({movementId:movement.id,...body})});
    const j=await r.json() as {error?:string};
    if(!r.ok){alert(j.error==='SOLO_ENCARGADO'?'Solo un encargado puede marcar esta devolución como registrada en sistema.':j.error||'ERROR');return false}
    location.reload();
    return true;
  }

  if(capture&&editable){
    return <div style={{maxWidth:680,margin:'0 auto'}}>
      <header style={{marginBottom:20}}><div><small style={{color:'#667085',fontWeight:700}}>DEVOLUCIÓN · {origins[movement.origin]}</small><h1 style={{marginTop:6}}>Agregar producto</h1><p>{movement.branch} · Captura únicamente lo necesario.</p></div></header>
      <section className="card pad" style={{padding:22,borderRadius:18}}>
        <form className="formGrid" autoComplete="off" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),selected=products.find(p=>p.id===String(f.get('product'))),colorId=selected?.colors[0]?.id;if(!colorId){alert('Este producto necesita al menos un color activo en el catálogo para poder registrarse.');return}act({action:'saveLine',productId:f.get('product'),colorId,modelReference:'N/A',quantity:Number(f.get('quantity')),condition:f.get('condition'),reason:f.get('reason')})}}>
          <label>Producto<select name="product" value={product} onChange={e=>setProduct(e.target.value)} required><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label>Cantidad<input name="quantity" type="number" min="1" inputMode="numeric" placeholder="Cantidad" autoComplete="off" required/></label>
          <label>Condición<select name="condition" defaultValue="" required><option value="" disabled>Selecciona una condición…</option><option value="GOOD">Buen estado</option><option value="DAMAGED">Dañado</option><option value="INCOMPLETE">Incompleto</option><option value="WRONG_PRODUCT">Producto incorrecto</option></select></label>
          <label>Motivo<input name="reason" placeholder="Describe brevemente el motivo" autoComplete="off" required/></label>
          <button className="primary" style={{width:'100%',marginTop:4,padding:14}}>Agregar producto</button>
          {lines.length>0&&<button type="button" onClick={()=>setCapture(false)} style={{width:'100%',background:'#f2f4f7'}}>Cancelar y volver</button>}
        </form>
      </section>
    </div>;
  }

  return <div style={{maxWidth:760,margin:'0 auto'}}>
    <header style={{marginBottom:18}}><div><small style={{color:'#667085',fontWeight:700}}>DEVOLUCIÓN · {origins[movement.origin]}</small><h1 style={{fontSize:'clamp(26px,7vw,38px)',overflowWrap:'anywhere',marginTop:6}}>{movement.folio}</h1><p>{movement.branch} · {statusLabels[movement.status]||movement.status}</p></div></header>

    <section className="card pad" style={{padding:22,borderRadius:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,marginBottom:14}}><div><h2 style={{margin:'0 0 4px'}}>Productos</h2><small style={{color:'#667085'}}>{lines.length} producto{lines.length===1?'':'s'} · {total} pieza{total===1?'':'s'}</small></div>{editable&&<button type="button" onClick={()=>setCapture(true)} style={{background:'#eaf3ff',color:'#0868d9'}}>+ Agregar producto</button>}</div>
      <div className="lines">{lines.map(l=><div className="line" key={l.id} style={{padding:14}}><div><b>{l.product}</b><small>{l.quantity} pieza{l.quantity===1?'':'s'} · {conditions[l.condition]||l.condition}</small><small>{l.reason}</small></div>{editable&&<button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Eliminar este producto de la devolución?')}>Eliminar</button>}</div>)}</div>
      {movement.status==='DRAFT'&&<button className="primary" style={{width:'100%',marginTop:18,padding:14}} disabled={lines.length===0} onClick={()=>act({action:'close'},`Cerrar devolución con ${lines.length} producto${lines.length===1?'':'s'} y ${total} pieza${total===1?'':'s'}?`)}>Terminar captura de devolución</button>}
    </section>

    <section className="card pad" style={{padding:22,borderRadius:18}}><h2 style={{marginTop:0}}>Evidencia</h2><p style={{color:'#667085',marginTop:-6}}>Hasta 2 fotografías.</p>{[1,2].map(slot=>{const ev=evidence.find(x=>x.slot===slot);return <div className="line" key={slot}><div><b>Foto {slot}</b>{ev&&<img src={ev.fileUrl} alt={`Evidencia ${slot}`} style={{display:'block',marginTop:8,maxWidth:'100%',maxHeight:180,borderRadius:10,objectFit:'cover'}}/>}</div>{editable&&(ev?<div className="actions"><button onClick={()=>{const url=prompt('URL de la nueva evidencia');if(url)act({action:'saveEvidence',slot,fileUrl:url})}}>Reemplazar</button><button onClick={()=>act({action:'deleteEvidence',slot})}>Eliminar</button></div>:<button onClick={()=>{const url=prompt('URL de la evidencia');if(url)act({action:'saveEvidence',slot,fileUrl:url})}}>Subir foto</button>)}</div>})}</section>

    {movement.status!=='DRAFT'&&<section className="card pad" style={{padding:22,borderRadius:18,marginBottom:20}}><small style={{fontWeight:800,color:'#667085'}}>PASO FINAL</small><h2 style={{margin:'6px 0'}}>Registrar en sistema</h2>{movement.pos_registered_at&&!posPending?<p style={{marginBottom:0,color:'#08783f',fontWeight:700}}>✓ Esta devolución ya fue registrada en sistema.</p>:<><p style={{color:'#667085'}}>Este paso corresponde al encargado de la sucursal.</p><button className="primary" style={{width:'100%',padding:14,opacity:canRegisterPos?1:.45,cursor:canRegisterPos?'pointer':'not-allowed'}} disabled={!canRegisterPos} onClick={()=>act({action:'pos'},'¿Confirmas que esta devolución ya fue registrada en el sistema?')}>Registrado en sistema</button>{!canRegisterPos&&<small style={{display:'block',marginTop:9,color:'#667085',textAlign:'center'}}>Visible para consulta · Solo el encargado puede confirmarlo</small>}</>}</section>}
  </div>;
}
