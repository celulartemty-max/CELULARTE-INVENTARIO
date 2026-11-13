import {requireUser} from '@/lib/auth/authorization';
import {auditRoute} from '@/lib/audit/route';
import {countRequestAction} from '@/lib/inventory/receiving-count-requests';
export const POST=auditRoute(async(req:Request)=>{
 try{return Response.json(await countRequestAction(await requireUser(),await req.json()),{headers:{'Cache-Control':'no-store'}})}
 catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo guardar la solicitud.'},{status:400})}
});
