"use client";
import {useState} from "react";

export type ProductAdminRow={id:string;name:string;status:string};

export default function ProductAdmin({initial}:{initial:ProductAdminRow[]}){
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
    {initial.map(p=><article className="productRow productEditorRow" key={p.id}>
      <div className="productTitleRow">
        {editingProduct===p.id?
          <form className="renameForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'renameProduct',id:p.id,name:f.get('name')})}}>
            <input name="name" aria-label="Nombre del producto" defaultValue={p.name} required autoFocus disabled={busy}/>
            <button className="saveButton" disabled={busy}><span aria-hidden="true">✓</span> {busy?'Guardando…':'Guardar'}</button><button type="button" className="ghostButton" disabled={busy} onClick={()=>setEditingProduct(null)}>Cancelar</button>
          </form>:
          <><div className="productName"><b>{p.name}</b><small>{p.status==='ACTIVE'?'ACTIVO':'INACTIVO'}</small></div><button type="button" className="editButton" disabled={busy} onClick={()=>setEditingProduct(p.id)}>Editar producto</button></>}
      </div>
    </article>)}
  </section>
}
