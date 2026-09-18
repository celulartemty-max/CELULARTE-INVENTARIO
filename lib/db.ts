import "server-only";
import { neon, Pool, type PoolClient } from "@neondatabase/serverless";
const url=process.env.DATABASE_URL;if(!url)throw new Error("DATABASE_URL is required");
export const sql=neon(url);
export async function withTransaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{const pool=new Pool({connectionString:url});const client=await pool.connect();try{await client.query("BEGIN");const value=await fn(client);await client.query("COMMIT");return value}catch(error){await client.query("ROLLBACK");throw error}finally{client.release();await pool.end()}}
