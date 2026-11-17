import './full-orders.css';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { requireFullAccess } from '@/lib/inventory/full-orders';
export default async function Page(){
 const user=await requireUser();await requireFullAccess(user);
 return <div className="fullWorkspace"><h1>Salidas</h1><div className="card pad" style={{display:'grid',gap:16}}><Link className="fullMenuLink" href="/salidas/nueva">Nueva salida →</Link><Link className="fullMenuLink" href="/salidas/pedidos">Gestión de Pedidos →</Link></div></div>;
}
