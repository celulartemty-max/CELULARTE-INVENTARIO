import 'server-only';
import type {PoolClient} from '@neondatabase/serverless';
// Always lock the FULL before its movements, including POS-only writes.
export async function lockFullForMovement(c:PoolClient,id:string,editing=true){
 const q=await c.query<{shipped_at:string|null;final_managed:boolean}>(`SELECT o.shipped_at,EXISTS(SELECT 1 FROM full_final_counts f JOIN branches b ON b.id=x.branch_id WHERE f.order_id=o.id AND b.name='Treviño') final_managed FROM full_orders o JOIN full_order_exits x ON x.order_id=o.id WHERE x.movement_id=$1 FOR UPDATE OF o`,[id]);
 if(editing&&q.rows[0]?.shipped_at)throw Error('El FULL ya fue enviado. No se puede modificar su contenido.');
 if(editing&&q.rows[0]?.final_managed)throw Error('Treviño se calcula desde el conteo final del FULL. Modifica el total en el pedido.');
}
export async function assertFullOpen(c:PoolClient,id:string){
 const q=await c.query<{shipped_at:string|null}>('SELECT shipped_at FROM full_orders WHERE id=$1 FOR UPDATE',[id]);
 if(!q.rows.length||q.rows[0].shipped_at)throw Error('El FULL ya fue enviado o no está disponible.');
}
