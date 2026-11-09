import {auditRoute} from '@/lib/audit/route';
import {requireUser} from '@/lib/auth/authorization';
import {z} from 'zod';
import {waiveFullContribution,closeFullShipment} from '@/lib/inventory/full-shipping';
import {reviewFullShipment,sendFullReturns,receiveFullReturns,contributeToFull,adjustFullTarget} from '@/lib/inventory/full-review';
const envelope=z.object({requestId:z.string().uuid(),action:z.enum(['review','send','receive','contribute','target','waive','ship']),payload:z.unknown()}).strict();
async function handle(req:Request){
 try{const u=await requireUser(),b=envelope.parse(await req.json());const fn={review:reviewFullShipment,send:sendFullReturns,receive:receiveFullReturns,contribute:contributeToFull,target:adjustFullTarget,waive:waiveFullContribution,ship:closeFullShipment}[b.action];const result=await fn(u,b.payload,b.requestId);return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:e instanceof Error?(e.name==='ZodError'?'Revisa las cantidades y campos.':e.message):'No se pudo guardar.'},{status:400});}
}
export const POST=auditRoute(handle);
