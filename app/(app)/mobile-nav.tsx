"use client";

import Link from "next/link";
import { useEffect,useRef } from "react";
import { usePathname } from "next/navigation";

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
    document.addEventListener("pointerdown",onPointerDown);
    return()=>document.removeEventListener("pointerdown",onPointerDown);
  },[]);

  return <nav className="mobileNav" aria-label="Navegación móvil">
    <Link href="/dashboard" onClick={closeMenus}><span>⌂</span><small>Inicio</small></Link>
    <Link href="/dashboard#movimientos" onClick={closeMenus}><span>▤</span><small>Movimientos</small></Link>
    {role==='MASTER'?<Link href="/productos" onClick={closeMenus}><span>◇</span><small>Productos</small></Link>:<Link href="/entradas/nueva" onClick={closeMenus}><span>□</span><small>Entrada</small></Link>}
    <details ref={moreRef} onToggle={()=>openOnly("more")}><summary><span>▥</span><small>Más</small></summary><div className="mobileMoreMenu"><Link href="/entradas/nueva" onClick={closeMenus}>Nueva entrada</Link><Link href="/devoluciones/nueva" onClick={closeMenus}>Nueva devolución</Link><Link href="/salidas/nueva" onClick={closeMenus}>Nueva salida</Link><Link href="/traspasos/nuevo" onClick={closeMenus}>Nuevo traspaso</Link></div></details>
    <details ref={accountRef} className="mobileAccount" onToggle={()=>openOnly("account")}><summary><span>♙</span><small>Mi cuenta</small></summary><div className="mobileMoreMenu"><b>{userName}</b><small>{role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></details>
  </nav>;
}
