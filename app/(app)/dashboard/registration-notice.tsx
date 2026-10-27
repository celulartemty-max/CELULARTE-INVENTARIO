import Link from 'next/link';
import { hasModulePermission, requireUser } from '@/lib/auth/authorization';
import { registrationPending } from '@/lib/inventory/system-registration';

export default async function RegistrationNotice() {
    const user=await requireUser();
    if (!await hasModulePermission(user,'REGISTRO_SISTEMA')) return null;
    const pending=await registrationPending(user);
    return <Link href="/registros" className="registrationDashboardNotice"><span><b>Registro en sistema</b><small>{pending.length ? `${pending.length} confirmaciones pendientes en tus sucursales` : 'Todo al día · ver historial'}</small></span><span aria-hidden="true">→</span></Link>;
}
