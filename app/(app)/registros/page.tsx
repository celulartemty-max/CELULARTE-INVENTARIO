import Link from 'next/link';
import { requireUser } from '@/lib/auth/authorization';
import { registrationHistory, registrationPending } from '@/lib/inventory/system-registration';
import RegistrationQueue from './registration-queue';
import './registration.css';
export const dynamic='force-dynamic';

export default async function Page() {
    const user=await requireUser();
    const [pending,history]=await Promise.all([registrationPending(user),registrationHistory(user)]);
    const fmt=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Monterrey',dateStyle:'medium',timeStyle:'short'});
    return <div className="registrationPage"><Link href="/dashboard">← Inicio</Link><header className="registrationHero"><span>ACCESO ESPECIAL</span><h1>Registro en sistema</h1><p>Confirma aquí lo que ya registraste en tu sistema. No se envía automáticamente al POS.</p></header>
        <RegistrationQueue rows={pending}/>
        <details className="registrationHistory"><summary>Historial de confirmaciones</summary>{history.length ? history.map(r=><article key={String(r.id)}><b>{String(r.reference)}</b><span>{String(r.branch)} · {String(r.actor)}</span><small>{fmt.format(new Date(String(r.created_at)))} · {String(r.action).includes('CORRECTION')?'Corrección':String(r.action).includes('DESTINATION')?'Destino':String(r.action).includes('ORIGIN')?'Origen':'Registro'}</small></article>) : <p>Aún no hay confirmaciones para tus sucursales.</p>}</details>
    </div>;
}
