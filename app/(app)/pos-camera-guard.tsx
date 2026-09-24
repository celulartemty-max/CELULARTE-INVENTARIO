"use client";

import {useEffect,useRef,useState} from "react";

async function preparePhoto(file:File){
  if(!file.type.startsWith("image/"))throw new Error("Toma una fotografía válida.");
  if(file.size>15*1024*1024)throw new Error("La fotografía es demasiado grande. Intenta nuevamente.");
  const objectUrl=URL.createObjectURL(file);
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("No se pudo leer la fotografía."));img.src=objectUrl});
    const maxSide=1200,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("No se pudo preparar la fotografía.");
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.72);
  }finally{URL.revokeObjectURL(objectUrl)}
}

function movementIdFromPath(pathname:string){
  const match=pathname.match(/^\/(?:entradas|devoluciones|salidas|traspasos)\/([^/?#]+)/);
  if(!match||match[1]==="nueva"||match[1]==="nuevo")return null;
  return decodeURIComponent(match[1]);
}

export default function PosCameraGuard(){
  const inputRef=useRef<HTMLInputElement>(null);
  const pendingButton=useRef<HTMLButtonElement|null>(null);
  const bypassOnce=useRef(new WeakSet<HTMLButtonElement>());
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const intercept=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target.closest("button"):null;
      if(!(target instanceof HTMLButtonElement)||target.disabled)return;
      const text=(target.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      if(text!=="registrado en sistema")return;
      if(bypassOnce.current.has(target)){bypassOnce.current.delete(target);return}
      const movementId=movementIdFromPath(window.location.pathname);if(!movementId)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(busy)return;
      pendingButton.current=target;
      inputRef.current?.click();
    };
    document.addEventListener("click",intercept,true);
    return()=>document.removeEventListener("click",intercept,true);
  },[busy]);

  async function captured(file?:File){
    const button=pendingButton.current;
    if(!file||!button){pendingButton.current=null;return}
    setBusy(true);
    const original=button.textContent;
    button.disabled=true;button.textContent="Guardando evidencia…";
    try{
      const movementId=movementIdFromPath(window.location.pathname);if(!movementId)throw new Error("No se pudo identificar el movimiento.");
      const evidence=await preparePhoto(file);
      const context=(button.parentElement?.innerText||button.innerText||"").slice(0,300);
      const response=await fetch("/api/pos-evidence",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({movementId,evidence,context,pathname:window.location.pathname})});
      let data:{error?:string}={};try{data=await response.json() as {error?:string}}catch{}
      if(!response.ok)throw new Error(data.error||"No se pudo guardar la evidencia.");
      button.disabled=false;button.textContent=original;
      bypassOnce.current.add(button);
      pendingButton.current=null;
      button.click();
    }catch(error){
      button.disabled=false;button.textContent=original;
      pendingButton.current=null;
      alert(error instanceof Error?error.message:"No se pudo guardar la evidencia. Intenta nuevamente.");
    }finally{
      setBusy(false);
      if(inputRef.current)inputRef.current.value="";
    }
  }

  return <input ref={inputRef} type="file" accept="image/*" capture="environment" aria-hidden="true" tabIndex={-1} style={{position:"fixed",width:1,height:1,opacity:0,pointerEvents:"none"}} onChange={e=>captured(e.currentTarget.files?.[0])}/>;
}
