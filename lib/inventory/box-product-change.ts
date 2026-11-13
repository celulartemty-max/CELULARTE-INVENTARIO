import 'server-only';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from '@neondatabase/serverless';
import type {SessionUser} from '@/lib/auth/types';

// The caller owns the receipt lock and checks module and branch access.
export async function changeBoxProduct(c:PoolClient,u:SessionUser,s:{id:string;branch_id:string;status:string},body:Record<string,unknown>){
 if(u.role!=='MASTER')throw Error('Solo Máster puede cambiar el producto de cajas.');
 if(s.status!=='DRAFT')throw Error('La recepción está cerrada o registrada. Requiere una corrección supervisada.');
 const x=z.object({orderId:z.string().uuid(),productId:z.string().uuid(),boxIds:z.array(z.string().uuid()).min(1).max(1000),reason:z.string().trim().min(5).max(1000)}).parse(body);
 if(new Set(x.boxIds).size!==x.boxIds.length)throw Error('Hay cajas repetidas.');
 const order=(await c.query('SELECT * FROM receiving_orders WHERE id=$1 AND branch_id=$2 AND voided_at IS NULL FOR UPDATE',[x.orderId,s.branch_id])).rows[0];
 if(!order||order.is_foreign)throw Error('Selecciona un pedido propio de esta recepción.');
 if(order.is_mixed)throw Error('Los productos de un pedido mixto se asignan por línea del packing, no por caja completa.');
 if(order.product_id===x.productId)throw Error('Elige un producto diferente.');
 const product=(await c.query("SELECT id,name FROM products WHERE id=$1 AND status='ACTIVE'",[x.productId])).rows[0];
 if(!product)throw Error('Producto no disponible.');
 const boxes=(await c.query('SELECT * FROM receiving_cartons WHERE order_id=$1 ORDER BY id FOR UPDATE',[x.orderId])).rows;
 const selected=boxes.filter(b=>x.boxIds.includes(b.id));
 if(selected.length!==x.boxIds.length||selected.some(b=>b.session_id!==s.id))throw Error('La selección cambió o incluye cajas de otra recepción. Actualiza la página.');
 const protectedBoxes=(await c.query(`SELECT 1 FROM receiving_destination_arrivals WHERE carton_id=ANY($1::uuid[])
 UNION ALL SELECT 1 FROM receiving_destination_registrations WHERE carton_id=ANY($1::uuid[]) LIMIT 1`,[x.boxIds])).rowCount;
 if(protectedBoxes)throw Error('Hay cajas recibidas en destino o registradas en sistema. No se cambiarán.');
 let targetId=order.id;
 if(selected.length===boxes.length){
  await c.query('UPDATE receiving_orders SET product_id=$1,product_label=NULL WHERE id=$2',[x.productId,order.id]);
 }else{
  // Split only the selected cartons. Their IDs, numbers, lines and count history stay intact.
  const reference=`${order.reference.slice(0,100)} · corrección ${randomUUID()}`;
  targetId=(await c.query(`INSERT INTO receiving_orders(branch_id,reference,product_id,shipping,marking,is_foreign,created_by,supplier,destination_branch_id,color_order)
   VALUES($1,$2,$3,$4,$5,false,$6,$7,$8,$9) RETURNING id`,[s.branch_id,reference,x.productId,order.shipping,order.marking,u.id,order.supplier,order.destination_branch_id,order.color_order])).rows[0].id;
  await c.query('UPDATE receiving_cartons SET order_id=$1 WHERE id=ANY($2::uuid[])',[targetId,x.boxIds]);
  // Keep the original attachment available in both groups, without altering its contents.
  await c.query(`INSERT INTO receiving_documents(order_id,filename,mime,data,created_by,created_at)
   SELECT $1,d.filename,d.mime,d.data,d.created_by,d.created_at FROM receiving_documents d WHERE d.order_id=$2 AND NOT EXISTS(
    SELECT 1 FROM audit_events a WHERE a.action='RECEIVING_PACKING_RESET' AND a.new_value->>'orderId'=d.order_id::text AND (a.new_value->'documentIds') ? d.id::text)`,[targetId,order.id]);
 }
 await c.query(`INSERT INTO audit_events(user_id,branch_id,action,new_value) VALUES($1,$2,'RECEIVING_BOX_PRODUCT_CHANGED',$3::jsonb)`,[u.id,s.branch_id,JSON.stringify({sessionId:s.id,sourceOrderId:order.id,targetOrderId:targetId,previousProductId:order.product_id,productId:x.productId,productName:product.name,boxes:selected.map(b=>({id:b.id,number:b.carton_number})),reason:x.reason})]);
 return {ok:true,orderId:targetId};
}
