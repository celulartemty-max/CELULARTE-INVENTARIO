import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "@/lib/db";
import type { SessionUser } from "./types";
const credentialSchema=z.array(z.object({email:z.string().email(),passwordHash:z.string().min(20)}));
export async function authenticate(email:string,password:string):Promise<SessionUser|null>{
 const normalized=email.trim().toLowerCase();
 const managed=await sql`SELECT u.id::text,u.email,u.name,u.role::text,u.primary_branch_id::text,c.password_hash FROM users u JOIN user_login_credentials c ON c.user_id=u.id WHERE lower(u.email)=${normalized} AND u.status::text='ACTIVE' LIMIT 1`.catch(()=>[]);
 let row:any=managed[0];
 if(row&&await bcrypt.compare(password,String(row.password_hash)))return{id:String(row.id),email:String(row.email),name:String(row.name),role:String(row.role) as SessionUser["role"],primaryBranchId:row.primary_branch_id?String(row.primary_branch_id):null};
 const parsed=credentialSchema.safeParse(JSON.parse(process.env.AUTH_CREDENTIALS_JSON??"[]"));if(!parsed.success)throw new Error("AUTH_CREDENTIALS_JSON is invalid");const credential=parsed.data.find(x=>x.email.toLowerCase()===normalized);if(!credential||!(await bcrypt.compare(password,credential.passwordHash)))return null;
 const rows=await sql`SELECT id::text,email,name,role::text,primary_branch_id::text FROM users WHERE lower(email)=${normalized} AND status::text='ACTIVE' LIMIT 1`;row=rows[0];if(!row)return null;return{id:String(row.id),email:String(row.email),name:String(row.name),role:String(row.role) as SessionUser["role"],primaryBranchId:row.primary_branch_id?String(row.primary_branch_id):null};
}