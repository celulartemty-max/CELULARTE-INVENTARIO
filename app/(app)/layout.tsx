import Link from "next/link";
import { requireUser } from "@/lib/auth/authorization";

function Brand(){return <span className="celularteWordmark">CELUL<span className="phoneGlyph">▯</span>ARTE</span>}

export default async function AppLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  const initials=user.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  return <div className="shell">
    <aside className="appSidebar"><Link href="/dashboard" className="brand"><Brand/></Link><nav className="desktopNav"><Link href="/dashboard">Inicio</Link><Link href="/dashboard#movimientos">Movimientos</Link><Link href="/entradas/nueva">Entradas</Link>{user.role==='MASTER'&&<Link href="/productos">Productos</Link>}<Link href="/devoluciones/nueva">Devoluciones</Link><Link href="/salidas/nueva">Salidas</Link><Link href="/traspasos/nuevo">Traspasos</Link></nav><div className="profile"><b>{user.name}</b><small>{user.role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></aside>
    <div className="mobileTopbar"><details className="hamburgerMenu"><summary aria-label="Abrir menú">☰</summary><div><Link href="/dashboard">Inicio</Link><Link href="/entradas/nueva">Entrada de inventario</Link><Link href="/devoluciones/nueva">Devoluciones</Link><Link href="/salidas/nueva">Salida de inventario</Link><Link href="/traspasos/nuevo">Traspasos</Link>{user.role==='MASTER'&&<Link href="/productos">Productos</Link>}</div></details><Link href="/dashboard" className="mobileBrand"><Brand/></Link><details className="accountMenu"><summary aria-label="Mi cuenta">{initials}</summary><div><b>{user.name}</b><small>{user.role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></details></div>
    <main className="content">{children}</main>
    <nav className="mobileNav" aria-label="Navegación móvil"><Link href="/dashboard"><span>⌂</span><small>Inicio</small></Link><Link href="/dashboard#movimientos"><span>▤</span><small>Movimientos</small></Link>{user.role==='MASTER'?<Link href="/productos"><span>◇</span><small>Productos</small></Link>:<Link href="/entradas/nueva"><span>□</span><small>Entrada</small></Link>}<details><summary><span>▥</span><small>Más</small></summary><div className="mobileMoreMenu"><Link href="/entradas/nueva">Nueva entrada</Link><Link href="/devoluciones/nueva">Nueva devolución</Link><Link href="/salidas/nueva">Nueva salida</Link><Link href="/traspasos/nuevo">Nuevo traspaso</Link></div></details><details className="mobileAccount"><summary><span>♙</span><small>Mi cuenta</small></summary><div className="mobileMoreMenu"><b>{user.name}</b><small>{user.role}</small><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></details></nav>
  </div>
}
