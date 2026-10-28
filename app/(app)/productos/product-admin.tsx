"use client";
import {useState} from "react";

export type ProductAdminRow={id:string;name:string;status:string};

export default function ProductAdmin({initial,canEdit=false}:{initial:ProductAdminRow[];canEdit?:boolean}){
  const [editingProduct,setEditingProduct]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function act(body:Record<string,unknown>){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error('No se pudo guardar el producto. Intenta nuevamente.');
      location.reload();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');setBusy(false)}
  }
  return <section className="card pad productAdmin">
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'createProduct',name:f.get('name')})}} className="productCreate">
      <input name="name" aria-label="Nombre del nuevo producto" placeholder="Nuevo producto" required disabled={busy}/>
      <button disabled={busy}>Agregar producto</button>
    </form>
    {error&&<p role="alert">{error}</p>}
    {initial.filter(p=>p.status==='ACTIVE').map(p=><article className="productRow productEditorRow" key={p.id}>
      <div className="productTitleRow">
        {canEdit&&editingProduct===p.id?
          <form className="renameForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'renameProduct',id:p.id,name:f.get('name')})}}>
            <input name="name" aria-label="Nombre del producto" defaultValue={p.name} required autoFocus disabled={busy}/>
            <button className="saveButton" disabled={busy}><span aria-hidden="true">✓</span> {busy?'Guardando…':'Guardar'}</button><button type="button" className="ghostButton" disabled={busy} onClick={()=>setEditingProduct(null)}>Cancelar</button>
          </form>:
          <><div className="productName"><b>{p.name}</b><small>ACTIVO</small></div>{canEdit&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="editButton" disabled={busy} onClick={()=>setEditingProduct(p.id)}>Editar producto</button><button type="button" className="ghostButton" style={{color:'#b42318'}} disabled={busy} aria-label={`Eliminar ${p.name} del catálogo activo`} onClick={()=>{if(confirm(`¿Eliminar “${p.name}” del catálogo activo? Se conservará en el historial de recepciones y movimientos. Podrás restaurarlo después.`))return act({action:'productStatus',id:p.id,status:'INACTIVE'})}}>Eliminar</button></div>}</>}
      </div>
    </article>)}
    {!initial.some(p=>p.status==='ACTIVE')&&<p>No hay productos activos.</p>}
    {initial.some(p=>p.status==='INACTIVE')&&<details style={{marginTop:20}}><summary>Productos eliminados del catálogo ({initial.filter(p=>p.status==='INACTIVE').length})</summary><p>Se conservan para mantener el historial. No están disponibles para capturas nuevas.</p>{initial.filter(p=>p.status==='INACTIVE').map(p=><article className="productRow productEditorRow" key={p.id}><div className="productTitleRow"><div className="productName"><b>{p.name}</b><small>DADO DE BAJA</small></div>{canEdit&&<button type="button" className="ghostButton" disabled={busy} onClick={()=>{if(confirm(`¿Restaurar “${p.name}” al catálogo activo?`))return act({action:'productStatus',id:p.id,status:'ACTIVE'})}}>Restaurar producto</button>}</div></article>)}</details>}
  </section>
}
