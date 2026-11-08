import { auditRoute } from '@/lib/audit/route';
import { requireUser } from '@/lib/auth/authorization';
import { createFullOrder } from '@/lib/inventory/full-orders';
import { renameFullOrder } from '@/lib/inventory/rename-full-order';
async function create(req:Request){
 try { const user=await requireUser();const id=await createFullOrder(user,await req.json());return Response.json({id},{headers:{'Cache-Control':'no-store'}}); }
 catch(error){const e=error as Error&{code?:string};return Response.json({error:e.code==='23505'?'Ya existe un pedido con ese número de Mercado Libre.':e.name==='ZodError'?'Revisa el número, título, total y sucursales.':e.message||'No se pudo crear el pedido.'},{status:400});}
}
export const POST=auditRoute(create);
async function rename(req:Request){
 try{const user=await requireUser();return Response.json(await renameFullOrder(user,await req.json()),{headers:{'Cache-Control':'no-store'}});}
 catch(error){const e=error as Error;return Response.json({error:e.name==='ZodError'?'Escribe un nombre de 1 a 160 caracteres.':e.message||'No se pudo guardar el nombre.'},{status:400});}
}
export const PATCH=auditRoute(rename);
