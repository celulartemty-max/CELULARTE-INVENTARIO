import { requireUser } from '@/lib/auth/authorization';
import { auditRoute } from '@/lib/audit/route';
import { confirmRegistration, registrationDetail } from '@/lib/inventory/system-registration';

export async function GET(req: Request) {
    try {
        const q = new URL(req.url).searchParams;
        return Response.json(await registrationDetail(await requireUser(), { id:q.get('id'),kind:q.get('kind'),side:q.get('side') }), { headers:{'Cache-Control':'private, no-store'} });
    } catch (error) { return Response.json({error:error instanceof Error?error.message:'Sin acceso.'},{status:403}); }
}
export const POST = auditRoute(async (req: Request) => {
    try {
        await confirmRegistration(await requireUser(),await req.json());
        return Response.json({ok:true});
    } catch (error) { return Response.json({error:error instanceof Error?error.message:'No se pudo confirmar.'},{status:400}); }
});
