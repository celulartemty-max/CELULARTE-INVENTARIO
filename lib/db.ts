import "server-only";
import { neon, Pool, type PoolClient } from "@neondatabase/serverless";
import { auditActor } from '@/lib/audit/context';
const url=process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL is required");
const rawSql=neon(url);
export const sql=new Proxy(rawSql,{
  apply(target,thisArg,args){
    const actor=auditActor();
    if(!actor)return Reflect.apply(target,thisArg,args);
    // set_config(...,true) is transaction-local, safe with pooled connections.
    const query=Reflect.apply(target,thisArg,args);
    return rawSql.transaction([rawSql`SELECT set_config('app.audit_user_id',${actor},true)`,query]).then(results=>results[1]);
  }
});
export async function withTransaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{const pool=new Pool({connectionString:url});const client=await pool.connect();try{await client.query("BEGIN");const actor=auditActor();if(actor)await client.query("SELECT set_config('app.audit_user_id',$1,true)",[actor]);const value=await fn(client);await client.query("COMMIT");return value}catch(error){await client.query("ROLLBACK");throw error}finally{client.release();await pool.end()}}
