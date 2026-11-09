import 'server-only';
import type {PoolClient} from '@neondatabase/serverless';
// Always lock the FULL before its movements, including POS-only writes.
export async function lockFullForMovement(c:PoolClient,id:string,editing=true){
 const q=await c.query<{shipped_at:string|null}>(`SELECT o.shipped_at FROM full_orders o JOIN full_order_exits x ON x.order_id=o.id WHERE x.movement_id=$1 FOR UPDATE OF o`,[id]);
 if(editing&&q.rows[0]?.shipped_at)throw Error('El FULL ya fue enviado. No se puede modificar su contenido.');
}
export async function assertFullOpen(c:PoolClient,id:string){
 const q=await c.query<{shipped_at:string|null}>('SELECT shipped_at FROM full_orders WHERE id=$1 FOR UPDATE',[id]);
 if(!q.rows.length||q.rows[0].shipped_at)throw Error('El FULL ya fue enviado o no está disponible.');
}
