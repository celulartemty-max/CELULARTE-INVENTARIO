import { requireUser } from '@/lib/auth/authorization';
import { receivingAction } from '@/lib/inventory/receiving';
export async function POST(req: Request) {
    try {
        if (Number(req.headers.get('content-length') || 0) > 3000000)
            throw new Error('Solicitud demasiado grande.');
        return Response.json(await receivingAction(await requireUser(), await req.json()));
    }
    catch (e) {
        return Response.json({ error: e instanceof Error && e.message.includes('duplicate key') ? 'Ese pedido ya existe. Usa sus cajas pendientes.' : e instanceof Error ? e.message : 'No se pudo guardar.' }, { status: 400 });
    }
}
