"use client";
import "./tiktok-labels.css";
import {useEffect,useMemo,useState} from "react";

type Item={id:string;product_name:string;variation:string;tiktok_sku_id:string|null;seller_sku:string|null;sku_source:string;updated_at:string};
export default function TikTokLabels(){
 const [items,setItems]=useState<Item[]>([]),[q,setQ]=useState(""),[filter,setFilter]=useState("ALL"),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[mode,setMode]=useState<"CATALOG"|"GENERATE">("CATALOG"),[qty,setQty]=useState<Record<string,number>>({});
 async function load(){const r=await fetch("/api/tiktok-labels");if(r.ok)setItems(await r.json())}
 useEffect(()=>{load()},[]);
 async function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setBusy(true);setMsg("");const fd=new FormData();fd.append("file",f);const r=await fetch("/api/tiktok-labels/import",{method:"POST",body:fd});const j=await r.json();setBusy(false);setMsg(r.ok?`Importación lista: ${j.imported} variantes · ${j.missingSku} sin SKU`:j.error||"No se pudo importar");if(r.ok)load();e.target.value=""}
 async function save(id:string,sku:string){const r=await fetch("/api/tiktok-labels",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,sku})});const j=await r.json();if(!r.ok){setMsg(j.error||"No se pudo guardar");return}load()}
 const shown=useMemo(()=>items.filter(x=>{const isMissing=!x.seller_sku;if(mode==="GENERATE"&&isMissing)return false;if(filter==="WITH"&&isMissing)return false;if(filter==="MISSING"&&!isMissing)return false;return (x.product_name+" "+x.variation+" "+(x.seller_sku||"")).toLowerCase().includes(q.toLowerCase())}),[items,q,filter,mode]);
 const missing=items.filter(x=>!x.seller_sku).length, selected=items.filter(x=>(qty[x.id]||0)>0),total=selected.reduce((a,x)=>a+(qty[x.id]||0),0);
 function printLabels(){if(!total)return;window.print()}
 return <div className="ttPage">
  <div className="ttHero"><div><span className="ttEyebrow">CELULARTE · TIKTOK SHOP</span><h1>Etiquetas TikTok</h1><p>Catálogo independiente para administrar SKU y generar etiquetas.</p></div>{mode==="CATALOG"&&<label className="ttUpload">{busy?"Importando…":"Importar Excel de TikTok"}<input type="file" accept=".xlsx,.xls" onChange={upload} disabled={busy}/></label>}</div>
  <div className="ttTabs"><button className={mode==="CATALOG"?"active":""} onClick={()=>setMode("CATALOG")}>Catálogo TikTok</button><button className={mode==="GENERATE"?"active":""} onClick={()=>{setMode("GENERATE");setFilter("ALL")}}>Generar etiquetas</button></div>
  {msg&&<div className="ttNotice">{msg}</div>}
  {mode==="CATALOG"?<><div className="ttStats"><div><b>{items.length}</b><span>Variantes</span></div><div><b>{items.length-missing}</b><span>Con SKU</span></div><div><b>{missing}</b><span>Falta SKU</span></div></div>
  <div className="ttToolbar"><input placeholder="Buscar producto, variación o SKU…" value={q} onChange={e=>setQ(e.target.value)}/><div className="ttFilters">{[["ALL","Todos"],["WITH","Con SKU"],["MISSING","Sin SKU"]].map(([v,l])=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{l}</button>)}</div></div>
  <div className="ttList">{shown.map(x=><div className="ttRow" key={x.id}><div className="ttInfo"><b>{x.product_name}</b><span>{x.variation||"Sin variación"}</span></div><Sku item={x} save={save}/></div>)}{!shown.length&&<div className="ttEmpty">No hay variantes para mostrar.</div>}</div></>:
  <><div className="ttGenerateTop"><div><b>{selected.length}</b><span>variantes seleccionadas</span></div><div><b>{total}</b><span>etiquetas a imprimir</span></div><button disabled={!total} onClick={printLabels}>Vista previa / Imprimir</button></div>
  <div className="ttToolbar"><input placeholder="Buscar producto, modelo, color o SKU…" value={q} onChange={e=>setQ(e.target.value)}/></div>
  <div className="ttList">{shown.map(x=><div className={"ttRow ttGenerateRow "+((qty[x.id]||0)>0?"selected":"")} key={x.id}><div className="ttInfo"><b>{x.product_name}</b><span>{x.variation||"Sin variación"}</span><em>SKU: {x.seller_sku}</em></div><div className="ttQty"><button onClick={()=>setQty(v=>({...v,[x.id]:Math.max(0,(v[x.id]||0)-1)}))}>−</button><input type="number" min="0" value={qty[x.id]||0} onChange={e=>setQty(v=>({...v,[x.id]:Math.max(0,Number(e.target.value)||0)}))}/><button onClick={()=>setQty(v=>({...v,[x.id]:(v[x.id]||0)+1}))}>+</button></div></div>)}{!shown.length&&<div className="ttEmpty">No hay productos con SKU para mostrar.</div>}</div>
  <div className="ttPrintArea">{selected.flatMap(x=>Array.from({length:qty[x.id]||0},(_,i)=><div className="ttLabel" key={x.id+"-"+i}><strong>{x.product_name}</strong><span>{x.variation}</span><b>{x.seller_sku}</b><small>TIKTOK SHOP</small></div>))}</div></>}
 </div>
}
function Sku({item,save}:{item:Item;save:(id:string,sku:string)=>void}){const [v,setV]=useState(item.seller_sku||"");useEffect(()=>setV(item.seller_sku||""),[item.seller_sku]);return <div className="ttSku"><small>{item.seller_sku?"SKU vendedor":"FALTA SKU"}</small><div><input value={v} placeholder="Asignar SKU" onChange={e=>setV(e.target.value.toUpperCase())}/>{v.trim()!==(item.seller_sku||"")&&<button onClick={()=>save(item.id,v.trim())}>Guardar</button>}</div></div>}
