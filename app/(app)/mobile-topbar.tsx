"use client";

import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import type {AppRole} from "@/lib/auth/types";

function Brand(){return <img src="/celularte-logo.svg?v=20260923-2" alt="CELULARTE" className="celularteLogo" style={{width:"clamp(150px, 42vw, 220px)",height:"auto",display:"block"}}/>}

export default function MobileTopbar({role,userName,initials}:{role:AppRole;userName:string;initials:string}){
  const [menuOpen,setMenuOpen]=useState(false);
  const [accountOpen,setAccountOpen]=useState(false);
  const topbarRef=useRef<HTMLDivElement>(null);
  const closeAll=()=>{setMenuOpen(false);setAccountOpen(false)};

  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(topbarRef.current&&!topbarRef.current.contains(event.target as Node))closeAll()};
    const history=()=>closeAll();
    const pageShow=()=>closeAll();
    document.addEventListener('pointerdown',outside);
    window.addEventListener('popstate',history);
    window.addEventListener('pageshow',pageShow);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('popstate',history);window.removeEventListener('pageshow',pageShow)};
  },[]);

  return <div className="mobileTopbar" ref={topbarRef}>
    <details className="hamburgerMenu" open={menuOpen} onToggle={e=>setMenuOpen(e.currentTarget.open)}>
      <summary aria-label="Abrir menú" onClick={e=>{e.preventDefault();setAccountOpen(false);setMenuOpen(v=>!v)}}>☰</summary>
      <div onClick={closeAll}><Link href="/dashboard">Inicio</Link><Link href="/entradas/nueva">Entrada de inventario</Link><Link href="/devoluciones/nueva">Devoluciones</Link><Link href="/salidas/nueva">Salida de inventario</Link><Link href="/traspasos/nuevo">Traspasos</Link>{role==='MASTER'&&<Link href="/productos">Productos</Link>}</div>
    </details>
    <Link href="/dashboard" className="mobileBrand" onClick={closeAll}><Brand/></Link>
    <details className="accountMenu" open={accountOpen} onToggle={e=>setAccountOpen(e.currentTarget.open)}>
      <summary aria-label="Mi cuenta" onClick={e=>{e.preventDefault();setMenuOpen(false);setAccountOpen(v=>!v)}}>{initials}</summary>
      <div><b>{userName}</b><small>{role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div>
    </details>
  </div>;
}
