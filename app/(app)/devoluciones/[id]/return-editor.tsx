"use client";

import {useState} from 'react';
import type {AppRole} from '@/lib/auth/types';

export type ReturnMovement={id:string;folio:string;branch_id:string;branch:string;origin:string;status:string;pos_registered_at:string|null;current_version:number};
export type ReturnLine={id:string;productId:string;colorId:string;model:string;quantity:number;condition:string;reason:string;product:string;color:string};
export type Evidence={slot:number;fileUrl:string};
export type ReturnProduct={id:string;name:string;colors:{id:string;name:string}[]};

const origins:Record<string,string>={RETURN_ML:'Mercado Libre',RETURN_TIKTOK:'TikTok',RETURN_CUSTOMER:'Cliente'};
const conditions:Record<string,string>={GOOD:'Buen estado',DAMAGED:'Dañado'};
const statusLabels:Record<string,string>={DRAFT:'En captura',CLOSED:'Captura terminada',PENDING_POS:'Pendiente de registrar',POS_REGISTERED:'Registrado en sistema',POS_CORRECTION_PENDING:'Corrección pendiente',POS_RECONCILED:'Registrado en sistema',CANCELLED:'Cancelada'};

async function prepareEvidenceImage(file:File){
  if(!file.type.startsWith('image/'))throw new Error('Selecciona una imagen válida.');
  if(file.size>15*1024*1024)throw new Error('La fotografía es demasiado grande. Intenta con otra imagen.');
  const objectUrl=URL.createObjectURL(file);
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo leer la fotografía.'));img.src=objectUrl});
    const maxSide=1600,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la fotografía.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.78);
  }finally{URL.revokeObjectURL(objectUrl)}
}

export default function ReturnEditor({movement,lines,evidence,products,role}:{movement:ReturnMovement;lines:ReturnLine[];evidence:Evidence[];products:ReturnProduct[];role:AppRole}){
  const editable=movement.status==='DRAFT'||(role==='MASTER'&&movement.status!=='CANCELLED');
  const [capture,setCapture]=useState(movement.status==='DRAFT'&&lines.length===0);
  const [product,setProduct]=useState('');
  const [condition,setCondition]=useState('');
  const [uploadingSlot,setUploadingSlot]=useState<number|null>(null);
  const total=lines.reduce((s,l)=>s+l.quantity,0);
  const hasDamaged=lines.some(l=>l.condition==='DAMAGED');
  const missingDamageEvidence=hasDamaged&&evidence.length===0;
  const posPending=movement.status==='POS_CORRECTION_PENDING'||(movement.status!=='DRAFT'&&!movement.pos_registered_at&&movement.status!=='CANCELLED');
  const canRegisterPos=role==='MASTER'||role==='MANAGER';

  async function act(body:Record<string,unknown>,msg?:string){
    if(msg&&!confirm(msg))return false;
    const r=await fetch('/api/returns',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({movementId:movement.id,...body})});
    const j=await r.json() as {error?:string};
    if(!r.ok){
      const message=j.error==='SOLO_ENCARGADO'?'Solo un encargado puede marcar esta devolución como registrada en sistema.':j.error==='DAMAGE_EVIDENCE_REQUIRED'?'Hay producto dañado. Agrega al menos una evidencia antes de terminar la devolución.':j.error==='REASON_REQUIRED'?'Describe brevemente el motivo del daño.':j.error||'ERROR';
      alert(message);return false;
    }
    location.reload();
    return true;
  }

  async function attachEvidence(slot:number,file?:File){
    if(!file)return;
    setUploadingSlot(slot);
    try{const fileUrl=await prepareEvidenceImage(file);await act({action:'saveEvidence',slot,fileUrl})}
    catch(e){alert(e instanceof Error?e.message:'No se pudo adjuntar la fotografía.');setUploadingSlot(null)}
  }

  const pickerStyle={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,minHeight:42,padding:'9px 12px',borderRadius:10,background:'#eaf3ff',color:'#0868d9',fontWeight:800,fontSize:13,cursor:'pointer',textAlign:'center' as const,flex:'1 1 125px'};

  if(capture&&editable){
    return <div style={{width:'100%',maxWidth:680,minWidth:0,margin:'0 auto',overflowX:'clip'}}>
      <header style={{marginBottom:20,minWidth:0}}><div style={{minWidth:0}}><small style={{color:'#667085',fontWeight:700}}>DEVOLUCIÓN · {origins[movement.origin]}</small><h1 style={{marginTop:6,overflowWrap:'anywhere'}}>Agregar producto</h1><p>{movement.branch} · Captura únicamente lo necesario.</p></div></header>
      <section className="card pad" style={{width:'100%',maxWidth:'100%',minWidth:0,padding:22,borderRadius:18,overflow:'hidden'}}>
        <form className="formGrid" autoComplete="off" style={{width:'100%',maxWidth:'100%',minWidth:0}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),selected=products.find(p=>p.id===String(f.get('product'))),colorId=selected?.colors[0]?.id;if(!colorId){alert('Este producto necesita al menos un color activo en el catálogo para poder registrarse.');return}act({action:'saveLine',productId:f.get('product'),colorId,modelReference:'N/A',quantity:Number(f.get('quantity')),condition:f.get('condition'),reason:condition==='DAMAGED'?f.get('reason'):''})}}>
          <label>Producto<select name="product" value={product} onChange={e=>setProduct(e.target.value)} required><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
          <label>Cantidad<input name="quantity" type="number" min="1" inputMode="numeric" placeholder="Cantidad" autoComplete="off" required/></label>
          <label>Condición<select name="condition" value={condition} onChange={e=>setCondition(e.target.value)} required><option value="" disabled>Selecciona una condición…</option><option value="GOOD">Buen estado</option><option value="DAMAGED">Dañado</option></select></label>
          {condition==='DAMAGED'&&<><label>Motivo del daño<input name="reason" placeholder="Describe brevemente el daño" autoComplete="off" required/></label><div style={{padding:'12px 14px',borderRadius:12,background:'#fff4e5',color:'#7a4b00',fontSize:14,lineHeight:1.4}}><b>Se requiere evidencia.</b><br/>Después de agregar el producto podrás adjuntar hasta 2 fotografías en el resumen de la devolución.</div></>}
          <button className="primary" style={{width:'100%',marginTop:4,padding:14}}>Agregar producto</button>
          {lines.length>0&&<button type="button" onClick={()=>setCapture(false)} style={{width:'100%',background:'#f2f4f7'}}>Cancelar y volver</button>}
        </form>
      </section>
    </div>;
  }

  return <div style={{width:'100%',maxWidth:760,minWidth:0,margin:'0 auto',overflowX:'clip'}}>
    <header style={{marginBottom:18,minWidth:0,maxWidth:'100%'}}><div style={{minWidth:0,maxWidth:'100%'}}><small style={{color:'#667085',fontWeight:700}}>DEVOLUCIÓN · {origins[movement.origin]}</small><h1 style={{fontSize:'clamp(25px,7vw,38px)',lineHeight:1.08,overflowWrap:'anywhere',wordBreak:'break-word',marginTop:6,maxWidth:'100%'}}>{movement.folio}</h1><p style={{overflowWrap:'anywhere'}}>{movement.branch} · {statusLabels[movement.status]||movement.status}</p></div></header>

    <section className="card pad" style={{width:'100%',maxWidth:'100%',minWidth:0,padding:22,borderRadius:18,overflow:'hidden'}}>
      <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'end',gap:12,marginBottom:14,minWidth:0}}><div style={{minWidth:0}}><h2 style={{margin:'0 0 4px'}}>Productos</h2><small style={{color:'#667085'}}>{lines.length} producto{lines.length===1?'':'s'} · {total} pieza{total===1?'':'s'}</small></div>{editable&&<button type="button" onClick={()=>{setCondition('');setProduct('');setCapture(true)}} style={{background:'#eaf3ff',color:'#0868d9',maxWidth:'100%'}}>+ Agregar producto</button>}</div>
      <div className="lines" style={{minWidth:0}}>{lines.map(l=><div className="line" key={l.id} style={{padding:14,minWidth:0,maxWidth:'100%'}}><div style={{minWidth:0,overflowWrap:'anywhere'}}><b>{l.product}</b><small>{l.quantity} pieza{l.quantity===1?'':'s'} · {conditions[l.condition]||l.condition}</small>{l.condition==='DAMAGED'&&l.reason&&<small>{l.reason}</small>}</div>{editable&&<button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Eliminar este producto de la devolución?')}>Eliminar</button>}</div>)}</div>
      {movement.status==='DRAFT'&&<><button className="primary" style={{width:'100%',maxWidth:'100%',marginTop:18,padding:14,whiteSpace:'normal',opacity:missingDamageEvidence?.5:1,cursor:missingDamageEvidence?'not-allowed':'pointer'}} disabled={lines.length===0||missingDamageEvidence} onClick={()=>act({action:'close'},`Cerrar devolución con ${lines.length} producto${lines.length===1?'':'s'} y ${total} pieza${total===1?'':'s'}?`)}>Terminar captura de devolución</button>{missingDamageEvidence&&<small style={{display:'block',marginTop:9,color:'#9a5b00',fontWeight:700,textAlign:'center'}}>Agrega una evidencia del producto dañado para continuar.</small>}</>}
    </section>

    {(hasDamaged||evidence.length>0)&&<section className="card pad" style={{width:'100%',maxWidth:'100%',minWidth:0,padding:22,borderRadius:18,overflow:'hidden',border:missingDamageEvidence?'1px solid #e6a23c':undefined}}><h2 style={{marginTop:0}}>Evidencia {hasDamaged&&<span style={{color:'#b54708'}}>*</span>}</h2><p style={{color:'#667085',marginTop:-6}}>{hasDamaged?'Obligatoria cuando hay producto dañado. Hasta 2 fotografías.':'Hasta 2 fotografías.'}</p>{[1,2].map(slot=>{const ev=evidence.find(x=>x.slot===slot),busy=uploadingSlot===slot;return <div className="line" key={slot} style={{minWidth:0,maxWidth:'100%',padding:14,marginBottom:10}}><div style={{minWidth:0,width:'100%'}}><b>Foto {slot}</b>{ev&&<img src={ev.fileUrl} alt={`Evidencia ${slot}`} style={{display:'block',marginTop:8,width:'100%',maxWidth:320,maxHeight:220,borderRadius:10,objectFit:'cover'}}/>}<div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:10,width:'100%'}}>{editable&&<><label style={{...pickerStyle,opacity:busy?.55:1,pointerEvents:busy?'none':'auto'}}>📷 {busy?'Guardando…':'Tomar foto'}<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';attachEvidence(slot,f)}} style={{display:'none'}}/></label><label style={{...pickerStyle,opacity:busy?.55:1,pointerEvents:busy?'none':'auto'}}>🖼️ {ev?'Cambiar imagen':'Elegir imagen'}<input type="file" accept="image/*" disabled={busy} onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';attachEvidence(slot,f)}} style={{display:'none'}}/></label>{ev&&<button type="button" disabled={busy} onClick={()=>act({action:'deleteEvidence',slot})} style={{flex:'1 1 100%',minHeight:42,background:'#fff0f0',color:'#c62828'}}>Eliminar foto</button>}</>}</div></div></div>})}</section>}

    {movement.status!=='DRAFT'&&<section className="card pad" style={{width:'100%',maxWidth:'100%',minWidth:0,padding:22,borderRadius:18,marginBottom:20,overflow:'hidden'}}><small style={{fontWeight:800,color:'#667085'}}>PASO FINAL</small><h2 style={{margin:'6px 0'}}>Registrar en sistema</h2>{movement.pos_registered_at&&!posPending?<p style={{marginBottom:0,color:'#08783f',fontWeight:700}}>✓ Esta devolución ya fue registrada en sistema.</p>:<><p style={{color:'#667085'}}>Este paso corresponde al encargado de la sucursal.</p><button className="primary" style={{width:'100%',padding:14,opacity:canRegisterPos?1:.45,cursor:canRegisterPos?'pointer':'not-allowed'}} disabled={!canRegisterPos} onClick={()=>act({action:'pos'},'¿Confirmas que esta devolución ya fue registrada en el sistema?')}>Registrado en sistema</button>{!canRegisterPos&&<small style={{display:'block',marginTop:9,color:'#667085',textAlign:'center'}}>Visible para consulta · Solo el encargado puede confirmarlo</small>}</>}</section>}
  </div>;
}
