import { requireUser } from '@/lib/auth/authorization';
import { destinationAction } from '@/lib/inventory/receiving-destination';

export async function POST(req: Request) {
    try {
        if (Number(req.headers.get('content-length') || 0) > 3000000) throw new Error('Solicitud demasiado grande.');
        return Response.json(await destinationAction(await requireUser(), await req.json()));
    } catch (error) {
        const message = error instanceof Error && error.message.includes('duplicate key') ? 'Ese modelo/color ya existe en esta caja.' : error instanceof Error ? error.message : 'No se pudo guardar.';
        return Response.json({ error: message }, { status: 400 });
    }
}
