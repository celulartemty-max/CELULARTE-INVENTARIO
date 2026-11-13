import type {packingSchema} from './receiving-validation';
import type {z} from 'zod';
type Client={query:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,any>[];rowCount:number|null}>};
export async function validateMixedPacking(c:Client,packing:z.infer<typeof packingSchema>,orderId:string){
 const lines=packing.boxes.flatMap(b=>b.items);
 if(!lines.some(l=>l.productLabel||l.productId))return;
 if(lines.some(l=>!l.productId))throw Error('Asigna un producto del catálogo a cada tipo del pedido mixto.');
 const ids=[...new Set(lines.map(l=>l.productId!))];
 if((await c.query("SELECT id FROM products WHERE id=ANY($1::uuid[]) AND status='ACTIVE'",[ids])).rows.length!==ids.length)throw Error('Producto del pedido mixto no válido o inactivo.');
 const pairs=new Set<string>();for(const box of packing.boxes)for(const line of box.items){const k=JSON.stringify([box.number,line.productId,line.model.toUpperCase(),line.color.toUpperCase()]);if(pairs.has(k))throw Error('Producto/modelo/color repetido en la misma caja.');pairs.add(k);}
 await c.query('UPDATE receiving_orders SET is_mixed=true WHERE id=$1',[orderId]);
}
