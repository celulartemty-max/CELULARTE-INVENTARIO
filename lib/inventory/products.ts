import "server-only";
import { sql } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/types";
const master=(u:SessionUser)=>{if(u.role!=="MASTER") throw new Error("MASTER_REQUIRED")};
export async function listProducts(){return sql`SELECT p.id::text,p.name,p.status::text,COALESCE(jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.name,'status',c.status::text) ORDER BY c.name) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) colors FROM products p LEFT JOIN product_colors c ON c.product_id=p.id GROUP BY p.id ORDER BY p.name`;}
export async function createProduct(u:SessionUser,name:string){master(u);const n=name.trim();if(!n)throw new Error("NAME_REQUIRED");return sql`INSERT INTO products(name) VALUES(${n}) RETURNING id::text`;}
export async function setProductStatus(u:SessionUser,id:string,status:"ACTIVE"|"INACTIVE"){master(u);await sql`UPDATE products SET status=${status}::record_status,updated_at=now() WHERE id=${id}::uuid`;}
export async function createColor(u:SessionUser,productId:string,name:string){master(u);const n=name.trim();if(!n)throw new Error("NAME_REQUIRED");return sql`INSERT INTO product_colors(product_id,name) VALUES(${productId}::uuid,${n}) RETURNING id::text`;}
export async function setColorStatus(u:SessionUser,id:string,status:"ACTIVE"|"INACTIVE"){master(u);await sql`UPDATE product_colors SET status=${status}::record_status,updated_at=now() WHERE id=${id}::uuid`;}
