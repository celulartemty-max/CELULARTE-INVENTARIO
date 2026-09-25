"use client";
import {useState} from "react";

export type ProductAdminRow={id:string;name:string;status:string;colors:Array<{id:string;name:string;status:string;hex?:string|null}>};

const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const validHex=(v:string)=>/^#[0-9A-Fa-f]{6}$/.test(v);
function swatch(name:string,hex?:string|null){
  if(hex&&validHex(hex))return hex;
  const n=normalize(name);
  const map:Array<[string,string]>=[
    ['glacier blue','#b9dce8'],['azul marino','#17365d'],['burgundy','#6f1d36'],['vino','#722f37'],['cherry','#a91d36'],['rojo','#d92d20'],['rosa','#f3a6bd'],['lila','#b8a1df'],['morado','#7f56d9'],['celeste','#74c7ec'],['azul','#2e6fd8'],['verde','#39a96b'],['amarillo','#f2cf45'],['naranja','#ef8b32'],['cafe','#795548'],['beige','#d8c3a5'],['dorado','#c7a548'],['plata','#b8bec8'],['plateado','#b8bec8'],['gris','#8b95a5'],['humo','#707782'],['negro','#171717'],['blanco','#ffffff']
  ];
  if(n.includes('transparente')||n.includes('clear'))return 'repeating-conic-gradient(#e7e9ee 0 25%,#fff 0 50%) 0/8px 8px';
  return map.find(([key])=>n.includes(key))?.[1]??'#d9dee7';
}

function HexField({initial='',label='Tono exacto'}:{initial?:string|null;label?:string}){
  const [hex,setHex]=useState(initial||'');
  const preview=validHex(hex)?hex:'#2E6FD8';
  return <div className="hexField">
    <label>{label}</label>
    <div className="hexControls">
      <input className="hexPicker" type="color" aria-label="Elegir tono exacto" value={preview} onChange={e=>setHex(e.target.value.toUpperCase())}/>
      <input className="hexInput" name="hex" value={hex} onChange={e=>setHex(e.target.value.toUpperCase())} placeholder="#2E6FD8" maxLength={7} pattern="^#[0-9A-Fa-f]{6}$" title="Usa un código HEX como #2E6FD8"/>
      {hex&&<button type="button" className="clearHex" onClick={()=>setHex('')}>Sin tono</button>}
    </div>
    <small>{initial?'Puedes cambiar el recuadro de color o escribir otro código HEX.':'Opcional. Para diseños como flores, mariposas o moños puedes dejarlo sin tono.'}</small>
  </div>
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
  function removeColor(id:string,name:string){
    if(!confirm(`¿Eliminar “${name}”?\n\nYa no aparecerá como opción para nuevas capturas. Los movimientos anteriores conservarán su información.`))return;
    act({action:'colorStatus',id,status:'INACTIVE'});
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
            <button className="saveButton" disabled={busy}><span aria-hidden="true">✓</span> {busy?'Guardando…':'Guardar'}</button><button type="button" className="ghostButton" onClick={()=>setEditingProduct(null)}>Cancelar</button>
          </form>:
          <><div className="productName"><b>{p.name}</b><small>{p.status==='ACTIVE'?'ACTIVO':'INACTIVO'}</small></div><button type="button" className="editButton" onClick={()=>setEditingProduct(p.id)}>Editar producto</button></>}
      </div>

      <div className="colorEditorList">
        {p.colors.filter(c=>c.status==='ACTIVE').map(c=>editingColor===c.id?
          <form key={c.id} className="renameForm colorRename" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'renameColor',id:c.id,name:f.get('name'),hex:f.get('hex')})}}>
            <span className="colorSwatch colorSwatchLarge" style={{background:swatch(c.name,c.hex)}} aria-hidden="true"/>
            <div className="colorEditHeading"><b>Editar color o diseño</b><small>{c.hex&&validHex(c.hex)?`Tono actual: ${c.hex.toUpperCase()}`:'Sin tono HEX guardado'}</small></div>
            <input name="name" defaultValue={c.name} required autoFocus aria-label="Nombre del color o diseño"/>
            <HexField initial={c.hex}/>
            <div className="colorFormActions">
              <button className="saveButton" disabled={busy}><span aria-hidden="true">✓</span> {busy?'Guardando…':'Guardar cambios'}</button>
              <button type="button" className="ghostButton" onClick={()=>setEditingColor(null)}>Cancelar</button>
              <button type="button" className="deleteColorButton" disabled={busy} onClick={()=>removeColor(c.id,c.name)}>Eliminar color</button>
            </div>
          </form>:
          <button type="button" className="colorChip" key={c.id} onClick={()=>setEditingColor(c.id)} title={`Editar ${c.name}`}>
            <span className="colorSwatch" style={{background:swatch(c.name,c.hex)}} aria-hidden="true"/><span>{c.name}</span>{c.hex&&<small className="chipHex">{c.hex}</small>}<span className="colorEditMark">✎</span>
          </button>)}
      </div>

      <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act({action:'createColor',productId:p.id,name:f.get('color'),hex:f.get('hex')})}} className="colorCreate colorCreateHex">
        <input name="color" placeholder="Agregar color o diseño" required/>
        <HexField label="Tono (opcional)"/>
        <button disabled={busy}>+ Agregar</button>
      </form>
    </article>)}
  </section>
}
