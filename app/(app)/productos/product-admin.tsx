"use client";
import {useState} from "react";

export type ProductAdminRow={id:string;name:string;status:string;colors:Array<{id:string;name:string;status:string}>};

const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
function swatch(name:string){
  const n=normalize(name);
  const map:Array<[string,string]>=[
    ['glacier blue','#b9dce8'],['azul marino','#17365d'],['burgundy','#6f1d36'],['vino','#722f37'],['cherry','#a91d36'],['rojo','#d92d20'],['rosa','#f3a6bd'],['lila','#b8a1df'],['morado','#7f56d9'],['celeste','#74c7ec'],['azul','#2e6fd8'],['verde','#39a96b'],['amarillo','#f2cf45'],['naranja','#ef8b32'],['cafe','#795548'],['beige','#d8c3a5'],['dorado','#c7a548'],['plata','#b8bec8'],['plateado','#b8bec8'],['gris','#8b95a5'],['humo','#707782'],['negro','#171717'],['blanco','#ffffff']
  ];
  if(n.includes('transparente')||n.includes('clear'))return 'repeating-conic-gradient(#e7e9ee 0 25%,#fff 0 50%) 0/8px 8px';
  return map.find(([key])=>n.includes(key))?.[1]??'#d9dee7';
}

export default function ProductAdmin({initial}:{initial:ProductAdminRow[]}){
  const [editingProduct,setEditingProduct]=useState<string|null>(null);
  const [editingColor,setEditingColor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  async function act(body:Record<string,unknown>){
    setBusy(true);
    const r=await fetch('/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok){alert(await r.text());setBusy(false);return}
    location.reload();
  }
  return <section className="card pad productAdmin">
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'createProduct',name:f.get('name')})}} className="productCreate">
      <input name="name" placeholder="Nuevo producto" required/>
      <button disabled={busy}>Agregar producto</button>
    </form>

    {initial.map(p=><article className="productRow productEditorRow" key={p.id}>
      <div className="productTitleRow">
        {editingProduct===p.id?
          <form className="renameForm" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'renameProduct',id:p.id,name:f.get('name')})}}>
            <input name="name" defaultValue={p.name} required autoFocus/>
            <button disabled={busy}>Guardar</button><button type="button" className="ghostButton" onClick={()=>setEditingProduct(null)}>Cancelar</button>
          </form>:
          <><div className="productName"><b>{p.name}</b><small>{p.status==='ACTIVE'?'ACTIVO':'INACTIVO'}</small></div><button type="button" className="editButton" onClick={()=>setEditingProduct(p.id)}>Editar producto</button></>}
      </div>

      <div className="colorEditorList">
        {p.colors.map(c=>editingColor===c.id?
          <form key={c.id} className="renameForm colorRename" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'renameColor',id:c.id,name:f.get('name')})}}>
            <span className="colorSwatch" style={{background:swatch(c.name)}} aria-hidden="true"/>
            <input name="name" defaultValue={c.name} required autoFocus/>
            <button disabled={busy}>Guardar</button><button type="button" className="ghostButton" onClick={()=>setEditingColor(null)}>Cancelar</button>
          </form>:
          <button type="button" className="colorChip" key={c.id} onClick={()=>setEditingColor(c.id)} title={`Editar ${c.name}`}>
            <span className="colorSwatch" style={{background:swatch(c.name)}} aria-hidden="true"/><span>{c.name}</span><span className="colorEditMark">✎</span>
          </button>)}
      </div>

      <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'createColor',productId:p.id,name:f.get('color')})}} className="colorCreate">
        <input name="color" placeholder="Agregar color" required/>
        <button disabled={busy}>+ Color</button>
      </form>
    </article>)}
  </section>
}
