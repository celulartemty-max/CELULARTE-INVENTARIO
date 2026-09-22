import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";
import MobileNav from "./mobile-nav";
import MobileTopbar from "./mobile-topbar";

function Brand(){return <img src="/celularte-logo.svg" alt="CELULARTE" className="celularteLogo" style={{width:"clamp(150px, 42vw, 220px)",height:"auto",display:"block"}}/>}

export default async function AppLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  const initials=user.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return <div className="shell">
    <aside className="appSidebar"><Link href="/dashboard" className="brand"><Brand/></Link><nav className="desktopNav"><Link href="/dashboard">Inicio</Link><Link href="/dashboard#movimientos">Movimientos</Link><Link href="/entradas/nueva">Entradas</Link>{user.role==='MASTER'&&<Link href="/productos">Productos</Link>}<Link href="/devoluciones/nueva">Devoluciones</Link><Link href="/salidas/nueva">Salidas</Link><Link href="/traspasos/nuevo">Traspasos</Link></nav><div className="profile"><b>{user.name}</b><small>{user.role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></aside>
    <MobileTopbar role={user.role} userName={user.name} initials={initials}/>
    <main className="content">{children}</main>
    <MobileNav role={user.role} userName={user.name}/>
  </div>
}
