"use client";
import {useState} from "react";
import TransferFinal from './transfer-final';
import { useRegistrationAccess } from "../../registration-access";

import TransferReceipt from './transfer-receipt';
import type {AppRole} from '@/lib/auth/types';

export type Transfer={id:string;folio:string;transfer_id:string;origin_branch_id:string;destination_branch_id:string;origin:string;destination:string;destinationInternal:boolean;status:string;transferKind:'TRANSFER'|'SALE';current_version:number;sent_at:string|null;received_at:string|null;origin_pos_registered_at:string|null;destination_pos_registered_at:string|null};
export type TransferLine={id:string;productId:string;product:string;sentQuantity:number;receivedQuantity:number|null;difference:number|null;differenceReason:string|null;saleAmount:number|null};
export type Product={id:string;name:string};

const statusLabels:Record<string,string>={DRAFT:'En captura',SENT:'Enviado',WAITING_RECEIPT:'Pendiente de recepción',RECEIVED:'Recibido',RECEIVED_WITH_DIFFERENCES:'Diferencias pendientes',PENDING_POS:'Envío cerrado · Pendiente de registrar',COMPLETED:'Completado',CANCELLED:'Cancelado'};
const money=(n:number)=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);

export default function TransferEditor({transfer:t,lines,products,canOrigin,canDestination}:{transfer:Transfer;lines:TransferLine[];products:Product[];canOrigin:boolean;canDestination:boolean;role:AppRole}){
  const [capture,setCapture]=useState(lines.length===0);
  const total=lines.reduce((s,l)=>s+l.sentQuantity,0);
  const saleTotal=lines.reduce((s,l)=>s+(l.saleAmount??0),0);
  const isSale=t.transferKind==='SALE',external=!t.destinationInternal;
  const canRegisterPos=useRegistrationAccess();

  async function act(body:Record<string,unknown>,msg?:string){
    if(msg&&!confirm(msg))return;
    const r=await fetch('/api/transfers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({movementId:t.id,...body})});
    const j=await r.json() as {error?:string};
    if(!r.ok){const message=j.error==='SOLO_ENCARGADO'?'Solo un encargado puede marcar este envío como registrado en sistema.':j.error==='DIFFERENCE_REASON_REQUIRED'?'Escribe el motivo de la diferencia antes de confirmar.':j.error==='SALE_AMOUNT_REQUIRED'?'En un envío por venta debes capturar un monto mayor a $0 para cada producto.':j.error==='EXTERNAL_DESTINATION'?'Las sucursales externas no requieren confirmación de recepción.':j.error||'ERROR';alert(message);return}
    location.reload();
  }

  if(capture&&canOrigin&&t.status==='DRAFT')return <div style={{width:'100%',maxWidth:680,minWidth:0,margin:'0 auto'}}><header style={{display:'block',marginBottom:16}}><h1 style={{fontSize:26,margin:'0 0 6px'}}>Agregar producto</h1><p>{`${t.origin} → ${t.destination}`}</p></header><section className="card pad" style={{padding:18,borderRadius:18}}><form className="formGrid" autoComplete="off" style={{marginTop:18}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'saveLine',productId:f.get('product'),quantity:Number(f.get('quantity')),saleAmount:isSale?Number(f.get('saleAmount')):undefined})}}><label>Producto<select name="product" defaultValue="" required><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Cantidad<input name="quantity" type="number" min="1" step="1" inputMode="numeric" placeholder="Cantidad" required/></label>{isSale&&<label>Monto de venta<input name="saleAmount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="$0.00" required/><small style={{display:'block',marginTop:5,color:'#667085'}}>Monto total correspondiente a este producto.</small></label>}<button type="submit" style={{width:'100%',padding:14}}>Agregar producto</button><button type="button" onClick={()=>setCapture(false)}>Cancelar y volver</button></form></section></div>;

  const typeLabel=isSale?'ENVÍO POR VENTA':'ENVÍO POR TRASPASO';
  const header=<header style={{marginBottom:20}}><div><small style={{color:'#667085',fontWeight:800}}>{typeLabel}{external?' · SUCURSAL EXTERNA':''}</small><h1 style={{fontSize:'clamp(28px,7vw,40px)',overflowWrap:'anywhere',margin:'6px 0 4px'}}>{t.folio}</h1><p style={{margin:0,color:'#667085'}}>{t.origin} → {t.destination} · {statusLabels[t.status]||t.status}</p>{isSale&&<p style={{margin:'7px 0 0',fontWeight:800}}>Valor del envío: {money(saleTotal)}</p>}</div></header>;


  if(t.status==='WAITING_RECEIPT')return <TransferReceipt transfer={t} lines={lines} canReceive={canDestination} onReceive={receivedLines=>act({action:'receive',lines:receivedLines},'¿Confirmas que estas son las cantidades que realmente llegaron?')}/>;

  if(t.status==='RECEIVED_WITH_DIFFERENCES')return <div style={{maxWidth:680,margin:'0 auto'}}>{header}<section className="card pad" style={{padding:22,borderRadius:18,marginBottom:18}}><small style={{fontWeight:800,color:'#667085'}}>RESUMEN DE RECEPCIÓN</small><h2 style={{margin:'6px 0 8px'}}>Se encontraron diferencias</h2><p style={{color:'#667085',lineHeight:1.45}}>El envío queda bloqueado para registro en sistema hasta que la sucursal de origen concilie las cantidades.</p><div style={{display:'grid',gap:12,marginTop:16}}>{lines.map(l=><div key={l.id} style={{padding:16,borderRadius:14,background:'#f6f7f9'}}><b style={{display:'block'}}>{l.product}</b><small style={{display:'block',color:'#667085',marginTop:4}}>Enviado: {l.sentQuantity} · Recibido: {l.receivedQuantity??0} · Diferencia: {l.difference??0}{isSale&&l.saleAmount!==null?` · ${money(l.saleAmount)}`:''}</small>{l.differenceReason&&<div style={{marginTop:9,fontSize:14}}><b>Motivo:</b> {l.differenceReason}</div>}</div>)}</div></section><section className="card pad" style={{padding:22,borderRadius:18}}><small style={{fontWeight:800,color:'#667085'}}>CONCILIACIÓN</small><h2 style={{margin:'6px 0 8px'}}>Aceptar cantidades recibidas</h2>{canOrigin?<><p style={{color:'#667085'}}>Al aceptar, las cantidades confirmadas por {t.destination} quedarán como definitivas.</p><button className="primary" style={{width:'100%',padding:15}} onClick={()=>act({action:'resolve'},'¿Aceptar como definitivas las cantidades confirmadas por destino?')}>Aceptar cantidades recibidas</button></>:<p style={{color:'#667085'}}>Pendiente de conciliación por {t.origin}.</p>}</section></div>;

  if(t.status==='PENDING_POS'||t.status==='COMPLETED')return <TransferFinal transfer={t} lines={lines} canOrigin={canOrigin} canDestination={canDestination} canRegister={canRegisterPos}/>;

  return <div style={{maxWidth:760,margin:'0 auto'}}>{header}<section className="card pad" style={{padding:22,borderRadius:18}}><div style={{marginBottom:16}}>{canOrigin&&t.status==='DRAFT'&&<button type="button" style={{float:'right',minHeight:44,background:'#eaf3ff',color:'#0868d9'}} onClick={()=>setCapture(true)}>+ Agregar producto</button>}<h2 style={{margin:'0 0 4px'}}>Productos</h2><small style={{color:'#667085'}}>{lines.length} producto{lines.length===1?'':'s'} · {total} pieza{total===1?'':'s'}{isSale?` · ${money(saleTotal)}`:''}</small></div><div style={{display:'grid',gap:10}}>{lines.map(l=><div className="line" key={l.id} style={{padding:14}}><div><b>{l.product}</b><small>{l.sentQuantity} pieza{l.sentQuantity===1?'':'s'}{isSale&&l.saleAmount!==null?` · ${money(l.saleAmount)}`:''}</small></div>{canOrigin&&t.status==='DRAFT'&&<button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Eliminar producto?')}>Eliminar</button>}</div>)}</div>{canOrigin&&t.status==='DRAFT'&&<div style={{borderTop:'1px solid #e4e7ec',marginTop:22,paddingTop:20}}>{external&&<div style={{padding:'12px 14px',borderRadius:12,background:'#fff8e6',color:'#7a4b00',fontSize:14,marginBottom:14}}><b>Destino externo.</b> Al enviar, el movimiento se cerrará sin esperar confirmación de recepción.</div>}{isSale&&lines.length>0&&<div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'0 2px 16px',fontWeight:800}}><span>Total de la venta</span><span>{money(saleTotal)}</span></div>}<button className="primary" style={{width:'100%',padding:15,opacity:lines.length?1:.45}} disabled={lines.length===0} onClick={()=>act({action:'send'},`Enviar ${total} piezas${isSale?` por ${money(saleTotal)}`:''} a ${t.destination}? ${external?'El envío quedará cerrado inmediatamente.':'Después ya no podrás editar la salida.'}`)}>Enviar a destino</button></div>}</section></div>;
}
