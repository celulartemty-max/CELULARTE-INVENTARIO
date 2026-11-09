import './full-orders.css';
import {sql} from '@/lib/db';
import {getAuthorizedBranchIds} from '@/lib/auth/authorization';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { requireFullAccess } from '@/lib/inventory/full-orders';
export default async function Page(){const u=await requireUser();await requireFullAccess(u);const ids=await getAuthorizedBranchIds(u),branches=await sql`SELECT id::text,name FROM branches WHERE name IN ('Treviño','Plaza del Audio') AND status::text='ACTIVE'`;const canReview=branches.some(b=>b.name==='Treviño'&&(ids===null||ids.includes(String(b.id)))),canReturn=branches.some(b=>ids===null||ids.includes(String(b.id)));return <div className="fullWorkspace"><h1>Salidas</h1><div className="card pad" style={{display:'grid',gap:16}}><Link className="fullMenuLink" href="/salidas/nueva">Nueva salida →</Link><Link className="fullMenuLink" href="/salidas/pedidos">Gestión de Pedidos →</Link></div>{canReview&&<p><Link href="/salidas/revision-full">Revisar piezas de Plaza →</Link></p>}{canReturn&&<p><Link href="/salidas/devoluciones-full">Regresos a Plaza →</Link></p>}</div>;}
