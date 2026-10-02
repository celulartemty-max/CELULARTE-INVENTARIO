"use client";
import {useEffect,useMemo,useState} from "react";

type Item={id:string;product_name:string;variation:string;tiktok_sku_id:string|null;seller_sku:string|null;sku_source:string;updated_at:string};
export default function TikTokLabels(){
 const [items,setItems]=useState<Item[]>([]),[q,setQ]=useState(""),[filter,setFilter]=useState("ALL"),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
 async function load(){const r=await fetch("/api/tiktok-labels");if(r.ok)setItems(await r.json())}
 useEffect(()=>{load()},[]);
 async function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setBusy(true);setMsg("");const fd=new FormData();fd.append("file",f);const r=await fetch("/api/tiktok-labels/import",{method:"POST",body:fd});const j=await r.json();setBusy(false);setMsg(r.ok?`Importación lista: ${j.imported} variantes · ${j.missingSku} sin SKU`:j.error||"No se pudo importar");if(r.ok)load();e.target.value=""}
 async function save(id:string,sku:string){const r=await fetch("/api/tiktok-labels",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,sku})});if(r.ok)load()}
 const shown=useMemo(()=>items.filter(x=>{const missing=!x.seller_sku; if(filter==="WITH"&&missing)return false;if(filter==="MISSING"&&!missing)return false;const s=(x.product_name+" "+x.variation+" "+(x.seller_sku||"")).toLowerCase();return s.includes(q.toLowerCase())}),[items,q,filter]);
 const missing=items.filter(x=>!x.seller_sku).length;
 return <div className="ttPage"><div className="ttHero"><div><span className="ttEyebrow">CELULARTE · TIKTOK SHOP</span><h1>Etiquetas TikTok</h1><p>Catálogo independiente para administrar SKU y preparar etiquetas.</p></div><label className="ttUpload">{busy?"Importando…":"Importar Excel de TikTok"}<input type="file" accept=".xlsx,.xls" onChange={upload} disabled={busy}/></label></div>
 {msg&&<div className="ttNotice">{msg}</div>}
 <div className="ttStats"><div><b>{items.length}</b><span>Variantes</span></div><div><b>{items.length-missing}</b><span>Con SKU</span></div><div><b>{missing}</b><span>Falta SKU</span></div></div>
 <div className="ttToolbar"><input placeholder="Buscar producto, variación o SKU…" value={q} onChange={e=>setQ(e.target.value)}/><div className="ttFilters">{[["ALL","Todos"],["WITH","Con SKU"],["MISSING","Sin SKU"]].map(([v,l])=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{l}</button>)}</div></div>
 <div className="ttList">{shown.map(x=><div className="ttRow" key={x.id}><div className="ttInfo"><b>{x.product_name}</b><span>{x.variation||"Sin variación"}</span></div><Sku item={x} save={save}/></div>)}{!shown.length&&<div className="ttEmpty">No hay variantes para mostrar.</div>}</div>
 </div>
}
function Sku({item,save}:{item:Item;save:(id:string,sku:string)=>void}){const [v,setV]=useState(item.seller_sku||"");useEffect(()=>setV(item.seller_sku||""),[item.seller_sku]);return <div className="ttSku"><small>{item.seller_sku?"SKU vendedor":"FALTA SKU"}</small><div><input value={v} placeholder="Asignar SKU" onChange={e=>setV(e.target.value.toUpperCase())}/>{v.trim()!==(item.seller_sku||"")&&<button onClick={()=>save(item.id,v.trim())}>Guardar</button>}</div></div>}
