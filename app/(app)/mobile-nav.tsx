"use client";

import Link from "next/link";
import { useEffect,useRef } from "react";
import { usePathname } from "next/navigation";

type NavIconKind="HOME"|"MOVEMENTS"|"PRODUCTS"|"RECEPTION"|"MORE"|"ACCOUNT";

function NavIcon({kind}:{kind:NavIconKind}){
  const common={width:23,height:23,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};
  if(kind==="HOME")return <svg {...common}><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M9.5 20v-6h5v6"/></svg>;
  if(kind==="MOVEMENTS")return <svg {...common}><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/><circle cx="6.5" cy="8" r=".25" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12" r=".25" fill="currentColor" stroke="none"/><circle cx="6.5" cy="16" r=".25" fill="currentColor" stroke="none"/></svg>;
  if(kind==="PRODUCTS")return <svg {...common}><path d="M4.5 8.2 12 4l7.5 4.2v8.4L12 21l-7.5-4.4Z"/><path d="m4.8 8.4 7.2 4.1 7.2-4.1M12 12.5V21"/></svg>;
  if(kind==="RECEPTION")return <svg {...common}><path d="M4.5 8.2 12 4l7.5 4.2v8.4L12 21l-7.5-4.4Z"/><path d="m4.8 8.4 7.2 4.1 7.2-4.1M12 12.5V21"/><path d="M12 2v6m0 0-2.2-2.2M12 8l2.2-2.2"/></svg>;
  if(kind==="MORE")return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>;
}

export default function MobileNav({role,userName}:{role:string;userName:string}){
  const pathname=usePathname();
  const moreRef=useRef<HTMLDetailsElement>(null);
  const accountRef=useRef<HTMLDetailsElement>(null);

  function closeMenus(){
    if(moreRef.current)moreRef.current.open=false;
    if(accountRef.current)accountRef.current.open=false;
  }

  function openOnly(which:"more"|"account"){
    const current=which==="more"?moreRef.current:accountRef.current;
    const other=which==="more"?accountRef.current:moreRef.current;
    if(current?.open&&other)other.open=false;
  }

  useEffect(()=>{closeMenus()},[pathname]);
  useEffect(()=>{
    function onPointerDown(event:PointerEvent){
      const target=event.target as Node;
      const insideMore=moreRef.current?.contains(target);
      const insideAccount=accountRef.current?.contains(target);
      if(!insideMore&&!insideAccount)closeMenus();
    }
    function onNavigation(){closeMenus()}
    document.addEventListener("pointerdown",onPointerDown);
    window.addEventListener("popstate",onNavigation);
    window.addEventListener("hashchange",onNavigation);
    window.addEventListener("pageshow",onNavigation);
    return()=>{
      document.removeEventListener("pointerdown",onPointerDown);
      window.removeEventListener("popstate",onNavigation);
      window.removeEventListener("hashchange",onNavigation);
      window.removeEventListener("pageshow",onNavigation);
    };
  },[]);

  return <nav className="mobileNav" aria-label="Navegación móvil">
    <Link href="/dashboard" onClick={closeMenus}><span><NavIcon kind="HOME"/></span><small>Inicio</small></Link>
    <Link href="/movimientos" onClick={closeMenus}><span><NavIcon kind="MOVEMENTS"/></span><small>Movimientos</small></Link>
    {role==='MASTER'?<Link href="/productos" onClick={closeMenus}><span><NavIcon kind="PRODUCTS"/></span><small>Productos</small></Link>:<Link href="/entradas/nueva" onClick={closeMenus}><span><NavIcon kind="RECEPTION"/></span><small>Entrada</small></Link>}
    <details ref={moreRef} onToggle={()=>openOnly("more")}><summary><span><NavIcon kind="MORE"/></span><small>Más</small></summary><div className="mobileMoreMenu"><Link href="/entradas/nueva" onClick={closeMenus}>Nueva entrada</Link><Link href="/devoluciones/nueva" onClick={closeMenus}>Nueva devolución</Link><Link href="/salidas/nueva" onClick={closeMenus}>Nueva salida</Link><Link href="/traspasos/nuevo" onClick={closeMenus}>Nuevo traspaso</Link></div></details>
    <details ref={accountRef} className="mobileAccount" onToggle={()=>openOnly("account")}><summary><span><NavIcon kind="ACCOUNT"/></span><small>Mi cuenta</small></summary><div className="mobileMoreMenu"><b>{userName}</b><small>{role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></details>
  </nav>;
}
