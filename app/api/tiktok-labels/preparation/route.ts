import {NextRequest,NextResponse} from 'next/server';
import {sql,withTransaction} from '@/lib/db';
import {requireUser,hasModulePermission,assertBranchAccess,isAdmin} from '@/lib/auth/authorization';
import {z} from 'zod';
import {auditRoute} from '@/lib/audit/route';

const branchSchema=z.object({action:z.literal('branch'),orderId:z.string().uuid(),branch:z.enum(['Treviño','Plaza del Audio']),quantities:z.record(z.string(),z.number().int().min(0).max(10000000)),products:z.record(z.string(),z.string().uuid()).optional(),sourceUpdatedAt:z.string().min(1)}).strict();
const requestSchema=z.object({action:z.literal('request'),orderId:z.string().uuid(),request:z.record(z.string(),z.number().int().min(0).max(10000000)),requestProducts:z.record(z.string(),z.string().uuid()),sourceUpdatedAt:z.string().min(1)}).strict();
const bodySchema=z.object({orderId:z.string().uuid(),plaza:z.record(z.string(),z.number().int().min(0).max(10000000)),products:z.record(z.string(),z.string().uuid()),request:z.record(z.string(),z.number().int().min(0).max(10000000)),sourceUpdatedAt:z.string().min(1)}).strict();
async function ready(){
 await sql`CREATE TABLE IF NOT EXISTS tiktok_order_preparations (
  order_id uuid PRIMARY KEY REFERENCES tiktok_label_orders(id) ON DELETE CASCADE,
  plaza jsonb NOT NULL DEFAULT '{}'::jsonb,
  trevino jsonb NOT NULL DEFAULT '{}'::jsonb,
  products jsonb NOT NULL DEFAULT '{}'::jsonb,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_products jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz,
  saved_by uuid REFERENCES users(id),
  saved_at timestamptz NOT NULL DEFAULT now()
 )`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS trevino jsonb NOT NULL DEFAULT '{}'::jsonb`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '{}'::jsonb`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS request jsonb NOT NULL DEFAULT '{}'::jsonb`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS request_products jsonb NOT NULL DEFAULT '{}'::jsonb`;
 await sql`ALTER TABLE tiktok_order_preparations ADD COLUMN IF NOT EXISTS source_updated_at timestamptz`;
 await sql`CREATE TABLE IF NOT EXISTS tiktok_order_exits(order_id uuid NOT NULL REFERENCES tiktok_label_orders(id) ON DELETE RESTRICT, branch_id uuid NOT NULL REFERENCES branches(id), movement_id uuid NOT NULL UNIQUE REFERENCES inventory_movements(id), PRIMARY KEY(order_id,branch_id))`;
}
async function access(){const user=await requireUser();if(!await hasModulePermission(user,'SALIDAS'))throw Error('Sin permiso de Salidas.');return user;}
export async function GET(req:NextRequest){
 try{await access();await ready();const orderId=req.nextUrl.searchParams.get('orderId');
  if(!orderId||!z.string().uuid().safeParse(orderId).success)return NextResponse.json({error:'Pedido inválido'},{status:400});
  const rows=await sql`SELECT plaza,trevino,products,request,request_products,source_updated_at::text,saved_at::text FROM tiktok_order_preparations WHERE order_id=${orderId}::uuid`;
  const exits=await sql`SELECT e.movement_id::text,b.name branch,m.status::text FROM tiktok_order_exits e JOIN inventory_movements m ON m.id=e.movement_id JOIN branches b ON b.id=e.branch_id WHERE e.order_id=${orderId}::uuid`;
  return NextResponse.json({... (rows[0]??{plaza:{},trevino:{},products:{},request:{},request_products:{},source_updated_at:null,saved_at:null}),exits});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Error al consultar'},{status:403});}
}
async function handlePUT(req:NextRequest){
 try{const user=await access();const payload=await req.json();await ready();
  if(payload.action==='close'){
   const b=z.object({action:z.literal('close'),orderId:z.string().uuid()}).strict().parse(payload);
   const exits=await withTransaction(async c=>{
    const o=(await c.query("SELECT items FROM tiktok_label_orders WHERE id=$1 FOR UPDATE",[b.orderId])).rows[0];if(!o)throw Error('Pedido no encontrado.');
    const existing=(await c.query("SELECT e.movement_id::text,b.name branch,m.status::text FROM tiktok_order_exits e JOIN branches b ON b.id=e.branch_id JOIN inventory_movements m ON m.id=e.movement_id WHERE e.order_id=$1",[b.orderId])).rows;
    if(existing.length){for(const e of existing){const q=await c.query("SELECT branch_id::text FROM inventory_movements WHERE id=$1",[e.movement_id]);await assertBranchAccess(user,q.rows[0].branch_id);}return existing;}
    const p=(await c.query("SELECT * FROM tiktok_order_preparations WHERE order_id=$1 FOR UPDATE",[b.orderId])).rows[0];if(!p)throw Error('Guarda primero las aportaciones.');
    const totals=new Map<string,number>();for(const item of o.items){const name=String(item.product_name||'Producto sin nombre').trim(),qty=Number(item.qty);if(!Number.isSafeInteger(qty)||qty<0)throw Error('Cantidad inválida');totals.set(name,(totals.get(name)||0)+qty);}
    const groups=[{name:'Treviño',lines:new Map<string,number>()},{name:'Plaza del Audio',lines:new Map<string,number>()}];
    for(const [name,total] of totals){const quantities=[Number(p.trevino[name]??0),Number(p.plaza[name]??0)];if(quantities.some(q=>!Number.isSafeInteger(q)||q<0)||quantities[0]+quantities[1]!==total)throw Error('Las aportaciones guardadas no coinciden con el pedido: '+name);if(total>0){const id=p.products[name];if(!id||!(await c.query("SELECT 1 FROM products WHERE id=$1 AND status='ACTIVE'",[id])).rowCount)throw Error('Selecciona un producto activo para '+name);groups.forEach((g,i)=>{if(quantities[i]>0)g.lines.set(id,(g.lines.get(id)||0)+quantities[i]);});}}
    const result=[];for(const g of groups){if(!g.lines.size)continue;const branch=(await c.query("SELECT id::text FROM branches WHERE name=$1 AND status='ACTIVE'",[g.name])).rows[0];if(!branch)throw Error('Sucursal no disponible');await assertBranchAccess(user,branch.id);
     const id=(await c.query("INSERT INTO inventory_movements(folio,movement_type,branch_id,created_by,status,closed_by,closed_at) VALUES($1,'EXIT',$2,$3,'CLOSED',$3,now()) RETURNING id::text",['SAL-TT-'+crypto.randomUUID(),branch.id,user.id])).rows[0].id;
     await c.query("INSERT INTO exits(movement_id,channel,exit_type) VALUES($1,'TIKTOK','FULL')",[id]);for(const [product,qty] of g.lines)await c.query("INSERT INTO exit_lines(movement_id,product_id,quantity) VALUES($1,$2,$3)",[id,product,qty]);
     const snapshot=(await c.query("SELECT jsonb_build_object('movement',to_jsonb(m),'exit',to_jsonb(e),'lines',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('product_name',p.name)) FROM exit_lines l JOIN products p ON p.id=l.product_id WHERE l.movement_id=m.id)) snapshot FROM inventory_movements m JOIN exits e ON e.movement_id=m.id WHERE m.id=$1",[id])).rows[0].snapshot;
     await c.query("INSERT INTO movement_versions(movement_id,version,snapshot,created_by) VALUES($1,1,$2::jsonb,$3) ON CONFLICT DO NOTHING",[id,JSON.stringify(snapshot),user.id]);await c.query("INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1,$2,$3,'EXIT_CLOSED',$4::jsonb)",[user.id,branch.id,id,JSON.stringify(snapshot)]);await c.query("INSERT INTO tiktok_order_exits(order_id,branch_id,movement_id) VALUES($1,$2,$3)",[b.orderId,branch.id,id]);result.push({movement_id:id,branch:g.name,status:'CLOSED'});
    }if(!result.length)throw Error('Pedido sin piezas');return result;
   });return NextResponse.json({ok:true,exits});
  }
  if(payload.orderId){const closed=await sql`SELECT 1 FROM tiktok_order_exits WHERE order_id=${payload.orderId}::uuid LIMIT 1`;if(closed.length)throw Error('El pedido ya está cerrado.');}
  if(payload.action==='branch'){
   const b=branchSchema.parse(payload);
   const branches=await sql`SELECT id::text FROM branches WHERE name=${b.branch} AND status::text='ACTIVE' LIMIT 1`;
   if(!branches.length)return NextResponse.json({error:'Sucursal no disponible'},{status:404});
   await assertBranchAccess(user,String(branches[0].id));
   const orders=await sql`SELECT items,updated_at::text FROM tiktok_label_orders WHERE id=${b.orderId}::uuid`;
   if(!orders.length)return NextResponse.json({error:'Pedido no encontrado'},{status:404});
   if(new Date(orders[0].updated_at).getTime()!==new Date(b.sourceUpdatedAt).getTime())return NextResponse.json({error:'El pedido TikTok cambió. Recarga la página.'},{status:409});
   const totals=new Map<string,number>();
   for(const item of (Array.isArray(orders[0].items)?orders[0].items:[])){const name=String(item.product_name||'Producto sin nombre').trim();totals.set(name,(totals.get(name)||0)+Number(item.qty||0));}
   for(const [name,qty] of Object.entries(b.quantities))if(!totals.has(name)||qty>totals.get(name)!)return NextResponse.json({error:'Cantidad fuera del pedido: '+name},{status:400});
   if(b.products){
    for(const name of Object.keys(b.products))if(!totals.has(name))return NextResponse.json({error:'Producto fuera del pedido: '+name},{status:400});
    const ids=[...new Set(Object.values(b.products))];
    if(ids.length){const active=await sql`SELECT id::text FROM products WHERE id=ANY(${ids}::uuid[]) AND status::text='ACTIVE'`;
     if(active.length!==ids.length)return NextResponse.json({error:'Selecciona productos activos del catálogo.'},{status:400});}
   }
   const normalized=Object.fromEntries([...totals].map(([name])=>[name,b.quantities[name]??0]));
   await sql`INSERT INTO tiktok_order_preparations(order_id,saved_by,saved_at) VALUES(${b.orderId}::uuid,${user.id}::uuid,now()) ON CONFLICT(order_id) DO NOTHING`;
   if(b.branch==='Treviño')await sql`UPDATE tiktok_order_preparations SET trevino=${JSON.stringify(normalized)}::jsonb,saved_by=${user.id}::uuid,saved_at=now() WHERE order_id=${b.orderId}::uuid`;
   else await sql`UPDATE tiktok_order_preparations SET plaza=${JSON.stringify(normalized)}::jsonb,saved_by=${user.id}::uuid,saved_at=now() WHERE order_id=${b.orderId}::uuid`;
   if(b.products&&Object.keys(b.products).length){await sql`UPDATE tiktok_order_preparations SET products=COALESCE(products,'{}'::jsonb)||${JSON.stringify(b.products)}::jsonb,saved_by=${user.id}::uuid,saved_at=now() WHERE order_id=${b.orderId}::uuid`;}
   return NextResponse.json({ok:true,branch:b.branch,quantities:normalized});
  }
  if(payload.action==='request'){
   if(!isAdmin(user))return NextResponse.json({error:'Solo administración puede guardar solicitudes.'},{status:403});
   const b=requestSchema.parse(payload);
   const orders=await sql`SELECT items,updated_at::text FROM tiktok_label_orders WHERE id=${b.orderId}::uuid`;
   if(!orders.length)return NextResponse.json({error:'Pedido no encontrado'},{status:404});
   if(new Date(orders[0].updated_at).getTime()!==new Date(b.sourceUpdatedAt).getTime())return NextResponse.json({error:'El pedido cambió. Recarga y revisa la solicitud.'},{status:409});
   const variants=new Map<string,number>();
   for(const item of (Array.isArray(orders[0].items)?orders[0].items:[])){const key=String(item.id||'');variants.set(key,(variants.get(key)||0)+Number(item.qty||0));}
   for(const [id,qty] of Object.entries(b.request))if(!variants.has(id)||qty>variants.get(id)!)return NextResponse.json({error:'Cantidad fuera del pedido'},{status:400});
   for(const id of Object.keys(b.requestProducts))if(!variants.has(id))return NextResponse.json({error:'Variante inválida'},{status:400});
   for(const [id,qty] of Object.entries(b.request))if(qty>0&&!b.requestProducts[id])return NextResponse.json({error:'Selecciona el producto COREONE para cada variante solicitada'},{status:400});
   const ids=[...new Set(Object.values(b.requestProducts))];
   if(ids.length){const active=await sql`SELECT id::text FROM products WHERE id=ANY(${ids}::uuid[]) AND status::text='ACTIVE'`;if(active.length!==ids.length)return NextResponse.json({error:'Producto de catálogo inválido'},{status:400});}
   await sql`INSERT INTO tiktok_order_preparations(order_id,request,request_products,source_updated_at,saved_by,saved_at)
    VALUES(${b.orderId}::uuid,${JSON.stringify(b.request)}::jsonb,${JSON.stringify(b.requestProducts)}::jsonb,${b.sourceUpdatedAt}::timestamptz,${user.id}::uuid,now())
    ON CONFLICT(order_id) DO UPDATE SET request=EXCLUDED.request,request_products=EXCLUDED.request_products,source_updated_at=EXCLUDED.source_updated_at,saved_by=EXCLUDED.saved_by,saved_at=now()`;
   return NextResponse.json({ok:true});
  }
  if(!isAdmin(user))return NextResponse.json({error:'Solo administración puede guardar el mapeo y la solicitud.'},{status:403});
  const body=bodySchema.parse(payload);
  const orders=await sql`SELECT items,updated_at::text FROM tiktok_label_orders WHERE id=${body.orderId}::uuid`;
  if(!orders.length)return NextResponse.json({error:'Pedido no encontrado'},{status:404});
  if(new Date(orders[0].updated_at).getTime()!==new Date(body.sourceUpdatedAt).getTime())return NextResponse.json({error:'El pedido de etiquetas cambió. Recarga y revisa la solicitud antes de guardar.'},{status:409});
  const totals=new Map<string,number>();
  const variants=new Map<string,number>();
  for(const item of (Array.isArray(orders[0].items)?orders[0].items:[])){
   const name=String(item.product_name||'Producto sin nombre').trim();
   const qty=Number(item.qty);
   if(!Number.isSafeInteger(qty)||qty<0)throw Error('Cantidad inválida en las etiquetas.');
   totals.set(name,(totals.get(name)||0)+qty);
   const key=String(item.id||'');if(!key)throw Error('Variante sin identificador');
   variants.set(key,(variants.get(key)||0)+qty);
  }
  for(const [id,qty] of Object.entries(body.request)){if(!variants.has(id)||qty>variants.get(id)!)return NextResponse.json({error:'Solicitud inválida: variante o cantidad fuera del pedido TikTok.'},{status:400});}
  for(const [name,qty] of Object.entries(body.plaza)){
   if(!totals.has(name)||qty>totals.get(name)!)return NextResponse.json({error:'La cantidad de Plaza no puede superar el total de '+name},{status:400});
  }
  if(Object.keys(body.products).length!==totals.size||[...totals.keys()].some(name=>!body.products[name]))return NextResponse.json({error:'Selecciona un producto de inventario para cada artículo.'},{status:400});
  const ids=[...new Set(Object.values(body.products))];
  const active=await sql`SELECT id::text FROM products WHERE id=ANY(${ids}::uuid[]) AND status::text='ACTIVE'`;
  if(active.length!==ids.length)return NextResponse.json({error:'Selecciona productos activos del catálogo.'},{status:400});
  const normalized=Object.fromEntries([...totals].map(([name])=>[name,body.plaza[name]??0]));
  const rows=await sql`INSERT INTO tiktok_order_preparations(order_id,plaza,products,request,source_updated_at,saved_by,saved_at)
   VALUES(${body.orderId}::uuid,${JSON.stringify(normalized)}::jsonb,${JSON.stringify(body.products)}::jsonb,${JSON.stringify(body.request)}::jsonb,${body.sourceUpdatedAt}::timestamptz,${user.id}::uuid,now())
   ON CONFLICT(order_id) DO UPDATE SET products=EXCLUDED.products,request=EXCLUDED.request,source_updated_at=EXCLUDED.source_updated_at,saved_by=EXCLUDED.saved_by,saved_at=now()
   RETURNING saved_at::text`;
  return NextResponse.json({ok:true,plaza:normalized,products:body.products,request:body.request,saved_at:rows[0].saved_at});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar'},{status:400});}
}
export const PUT=auditRoute(handlePUT);
