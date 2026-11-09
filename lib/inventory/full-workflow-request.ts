import 'server-only';
import {z} from 'zod';
import type {PoolClient} from '@neondatabase/serverless';
import type {SessionUser} from '@/lib/auth/types';
import {withTransaction} from '@/lib/db';
export async function runFullWorkflow<T>(u:SessionUser,id:string,action:string,payload:unknown,fn:(c:PoolClient)=>Promise<T>){
 z.string().uuid().parse(id);
 return withTransaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
  const existing=await c.query<{result:T;matches:boolean}>(`SELECT result,(user_id=$2::uuid AND action=$3 AND payload=$4::jsonb) matches FROM full_workflow_requests WHERE id=$1`,[id,u.id,action,JSON.stringify(payload)]);
  if(existing.rows.length){if(!existing.rows[0].matches)throw Error('Solicitud incompatible. Recarga e intenta de nuevo.');return existing.rows[0].result;}
  const result=await fn(c);await c.query('INSERT INTO full_workflow_requests(id,action,user_id,payload,result) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)',[id,action,u.id,JSON.stringify(payload),JSON.stringify(result??null)]);return result;
 });
}
