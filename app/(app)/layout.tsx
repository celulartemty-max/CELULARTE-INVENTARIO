import Link from "next/link";
import { getModulePermissions, requireUser } from "@/lib/auth/authorization";
import MobileNav from "./mobile-nav";
import MobileTopbar from "./mobile-topbar";
import PosCameraGuard from "./pos-camera-guard";
import "./desktop-premium.css";

function Brand(){return <img src="/celularte-logo.png" alt="CELULARTE" className="celularteLogo" style={{width:"clamp(150px, 42vw, 220px)",height:"auto",display:"block",objectFit:"contain"}}/>}

export default async function AppLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  const permissions=await getModulePermissions(user);
  const can=(m:string)=>permissions===null||permissions.includes(m);
  const initials=user.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return <div className="shell">
    <aside className="appSidebar"><Link href="/dashboard" className="brand"><Brand/></Link><nav className="desktopNav"><Link href="/dashboard">Inicio</Link>{can("MOVIMIENTOS")&&<Link href="/dashboard#movimientos">Movimientos</Link>}{can("ENTRADAS")&&<Link href="/entradas/nueva">Entradas</Link>}{can("PRODUCTOS")&&<Link href="/productos">Productos</Link>}{can("DEVOLUCIONES")&&<Link href="/devoluciones/nueva">Devoluciones</Link>}{can("SALIDAS")&&<Link href="/salidas/nueva">Salidas</Link>}{can("TRASPASOS")&&<Link href="/traspasos/nuevo">Traspasos</Link>}{can("ETIQUETAS_TIKTOK")&&<Link href="/etiquetas-tiktok">Etiquetas TikTok</Link>}</nav><div className="profile"><b>{user.name}</b><small>{user.role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></aside>
    <MobileTopbar role={user.role} userName={user.name} initials={initials} permissions={permissions}/>
    <main className="content">{children}</main>
    <MobileNav role={user.role} userName={user.name} permissions={permissions}/>
    <PosCameraGuard/>
  </div>
}
