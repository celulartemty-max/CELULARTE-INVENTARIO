"use client";

import type {AppRole} from '@/lib/auth/types';

export type ExitMovement={id:string;folio:string;branch_id:string;branch:string;status:string;pos_registered_at:string|null;current_version:number;channel:string;exit_type:string;reason:string|null};
export type ExitLine={id:string;productId:string;quantity:number;product:string};
export type Product={id:string;name:string};

const ch:Record<string,string>={MERCADO_LIBRE:'Mercado Libre',TIKTOK:'TikTok',OTHER:'Otro'};
const ty:Record<string,string>={FULL:'Full',INDEPENDENT_SALE:'Venta independiente'};
const statusLabels:Record<string,string>={DRAFT:'En captura',CLOSED:'Salida cerrada',PENDING_POS:'Pendiente de registrar',POS_REGISTERED:'Registrado en sistema',POS_CORRECTION_PENDING:'Corrección pendiente',POS_RECONCILED:'Registrado en sistema',CANCELLED:'Cancelada'};

export default function ExitEditor({movement,lines,products,role}:{movement:ExitMovement;lines:ExitLine[];products:Product[];role:AppRole}){
  const total=lines.reduce((s,l)=>s+l.quantity,0);
  const isDraft=movement.status==='DRAFT';
  const posPending=movement.status==='POS_CORRECTION_PENDING'||(!isDraft&&!movement.pos_registered_at&&movement.status!=='CANCELLED');
  const canRegisterPos=role==='MASTER'||role==='MANAGER';
  const detail=movement.channel==='OTHER'?`Motivo: ${movement.reason||'Sin motivo'}`:ty[movement.exit_type];

  async function act(body:Record<string,unknown>,msg?:string){
    if(msg&&!confirm(msg))return;
    const r=await fetch('/api/exits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({movementId:movement.id,...body})});
    const j=await r.json() as {error?:string};
    if(!r.ok){
      const message=j.error==='SOLO_ENCARGADO'?'Solo un encargado puede marcar esta salida como registrada en sistema.':j.error||'ERROR';
      alert(message);
      return;
    }
    location.reload();
  }

  if(!isDraft){
    return <div style={{maxWidth:680,margin:'0 auto'}}>
      <header style={{marginBottom:20}}>
        <div>
          <small style={{color:'#667085',fontWeight:800}}>SALIDA DE INVENTARIO · {ch[movement.channel]||movement.channel}</small>
          <h1 style={{fontSize:'clamp(28px,7vw,40px)',overflowWrap:'anywhere',margin:'6px 0 4px'}}>{movement.folio}</h1>
          <p style={{margin:0}}>{movement.branch} · {detail} · {statusLabels[movement.status]||movement.status}</p>
        </div>
      </header>

      <section className="card pad" style={{padding:24,borderRadius:18,marginBottom:20}}>
        <small style={{fontWeight:800,color:'#667085'}}>RESUMEN DE SALIDA</small>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
          <div style={{padding:16,borderRadius:14,background:'#f6f7f9'}}><b style={{display:'block',fontSize:24}}>{lines.length}</b><small style={{color:'#667085'}}>Producto{lines.length===1?'':'s'}</small></div>
          <div style={{padding:16,borderRadius:14,background:'#f6f7f9'}}><b style={{display:'block',fontSize:24}}>{total}</b><small style={{color:'#667085'}}>Pieza{total===1?'':'s'}</small></div>
        </div>
      </section>

      <section className="card pad" style={{padding:24,borderRadius:18}}>
        <small style={{fontWeight:800,color:'#667085'}}>PASO FINAL</small>
        <h2 style={{margin:'6px 0 8px'}}>Registrar en sistema</h2>
        {movement.pos_registered_at&&!posPending?
          <div style={{padding:'16px 18px',borderRadius:14,background:'#eefaf3',color:'#08783f',fontWeight:800}}>✓ Esta salida ya fue registrada en sistema.</div>
          :<>
            <p style={{color:'#667085',lineHeight:1.45}}>La captura ya está cerrada. Este paso corresponde únicamente al encargado de la sucursal.</p>
            <button className="primary" style={{width:'100%',padding:15,opacity:canRegisterPos?1:.45,cursor:canRegisterPos?'pointer':'not-allowed'}} disabled={!canRegisterPos} onClick={()=>act({action:'pos'},'¿Confirmas que esta salida ya fue registrada en el sistema?')}>Registrado en sistema</button>
            {!canRegisterPos&&<small style={{display:'block',marginTop:10,color:'#667085',textAlign:'center'}}>Visible para consulta · Solo el encargado puede confirmarlo</small>}
          </>}
      </section>
    </div>;
  }

  return <div style={{maxWidth:760,margin:'0 auto'}}>
    <header style={{marginBottom:18}}>
      <div>
        <small style={{color:'#667085',fontWeight:800}}>SALIDA DE INVENTARIO · {ch[movement.channel]||movement.channel}</small>
        <h1 style={{fontSize:'clamp(28px,7vw,40px)',overflowWrap:'anywhere',margin:'6px 0 4px'}}>{movement.folio}</h1>
        <p style={{margin:0}}>{movement.branch} · {detail} · En captura</p>
      </div>
    </header>

    <section className="card pad" style={{padding:22,borderRadius:18}}>
      <div style={{marginBottom:16}}><h2 style={{margin:'0 0 4px'}}>Productos</h2><small style={{color:'#667085'}}>{lines.length} producto{lines.length===1?'':'s'} · {total} pieza{total===1?'':'s'}</small></div>
      <div className="lines">{lines.map(l=><div className="line" key={l.id} style={{padding:14}}><div><b>{l.product}</b><small>{l.quantity} pieza{l.quantity===1?'':'s'}</small></div><button onClick={()=>act({action:'deleteLine',lineId:l.id},'¿Eliminar este producto de la salida?')}>Eliminar</button></div>)}</div>

      <form className="formGrid" autoComplete="off" style={{marginTop:18}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'saveLine',productId:f.get('product'),quantity:Number(f.get('quantity'))})}}>
        <label>Producto<select name="product" defaultValue="" required><option value="" disabled>Selecciona un producto…</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>Cantidad<input name="quantity" type="number" min="1" step="1" inputMode="numeric" placeholder="Cantidad" autoComplete="off" required/></label>
        <button type="submit" style={{width:'100%',padding:14}}>Agregar producto</button>
      </form>

      <div style={{borderTop:'1px solid #e4e7ec',marginTop:22,paddingTop:20}}>
        <button className="primary" style={{width:'100%',padding:15,opacity:lines.length?1:.45,cursor:lines.length?'pointer':'not-allowed'}} disabled={lines.length===0} onClick={()=>act({action:'close'},`Cerrar salida con ${lines.length} producto${lines.length===1?'':'s'} y ${total} pieza${total===1?'':'s'}? Después pasarás a la pantalla de registro en sistema.`)}>Cerrar salida</button>
        <small style={{display:'block',marginTop:9,color:'#667085',textAlign:'center'}}>Al cerrar, la captura termina y pasarás al paso de registro en sistema.</small>
      </div>
    </section>
  </div>;
}
