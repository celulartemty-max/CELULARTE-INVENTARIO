import {NextRequest,NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {requireUser,hasModulePermission} from '@/lib/auth/authorization';
import {z} from 'zod';
import {auditRoute} from '@/lib/audit/route';

const bodySchema=z.object({orderId:z.string().uuid(),plaza:z.record(z.string(),z.number().int().min(0).max(10000000)),products:z.record(z.string(),z.string().uuid())}).strict();
async function ready(){
 await sql`CREATE TABLE IF NOT EXISTS tiktok_order_preparations (
  order_id uuid PRIMARY KEY REFERENCES tiktok_label_orders(id) ON DELETE CASCADE,
  plaza jsonb NOT NULL DEFAULT '{}'::jsonb,
  products jsonb NOT NULL DEFAULT '{}'::jsonb,
  saved_by uuid REFERENCES users(id),
  saved_at timestamptz NOT NULL DEFAULT now()
 )`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '{}'::jsonb`;
}
async function access(){const user=await requireUser();if(!await hasModulePermission(user,'SALIDAS'))throw Error('Sin permiso de Salidas.');return user;}
export async function GET(req:NextRequest){
 try{await access();await ready();const orderId=req.nextUrl.searchParams.get('orderId');
  if(!orderId||!z.string().uuid().safeParse(orderId).success)return NextResponse.json({error:'Pedido inválido'},{status:400});
  const rows=await sql`SELECT plaza,products,saved_at::text FROM tiktok_order_preparations WHERE order_id=${orderId}::uuid`;
  return NextResponse.json(rows[0]??{plaza:{},products:{},saved_at:null});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Error al consultar'},{status:403});}
}
async function handlePUT(req:NextRequest){
 try{const user=await access();const body=bodySchema.parse(await req.json());await ready();
  const orders=await sql`SELECT items FROM tiktok_label_orders WHERE id=${body.orderId}::uuid`;
  if(!orders.length)return NextResponse.json({error:'Pedido no encontrado'},{status:404});
  const totals=new Map<string,number>();
  for(const item of (Array.isArray(orders[0].items)?orders[0].items:[])){
   const name=String(item.product_name||'Producto sin nombre').trim();
   const qty=Number(item.qty);
   if(!Number.isSafeInteger(qty)||qty<0)throw Error('Cantidad inválida en las etiquetas.');
   totals.set(name,(totals.get(name)||0)+qty);
  }
  for(const [name,qty] of Object.entries(body.plaza)){
   if(!totals.has(name)||qty>totals.get(name)!)return NextResponse.json({error:'La cantidad de Plaza no puede superar el total de '+name},{status:400});
  }
  if(Object.keys(body.products).length!==totals.size||[...totals.keys()].some(name=>!body.products[name]))return NextResponse.json({error:'Selecciona un producto de inventario para cada artículo.'},{status:400});
  const ids=[...new Set(Object.values(body.products))];
  const active=await sql`SELECT id::text FROM products WHERE id=ANY(${ids}::uuid[]) AND status::text='ACTIVE'`;
  if(active.length!==ids.length)return NextResponse.json({error:'Selecciona productos activos del catálogo.'},{status:400});
  const normalized=Object.fromEntries([...totals].map(([name])=>[name,body.plaza[name]??0]));
  const rows=await sql`INSERT INTO tiktok_order_preparations(order_id,plaza,products,saved_by,saved_at)
   VALUES(${body.orderId}::uuid,${JSON.stringify(normalized)}::jsonb,${JSON.stringify(body.products)}::jsonb,${user.id}::uuid,now())
   ON CONFLICT(order_id) DO UPDATE SET plaza=EXCLUDED.plaza,products=EXCLUDED.products,saved_by=EXCLUDED.saved_by,saved_at=now()
   RETURNING saved_at::text`;
  return NextResponse.json({ok:true,plaza:normalized,products:body.products,saved_at:rows[0].saved_at});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar'},{status:400});}
}
export const PUT=auditRoute(handlePUT);
