import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";
const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeSku(){let s="";for(let i=0;i<7;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
export async function POST(){
 const u=await requireUser();if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
 await sql`CREATE TABLE IF NOT EXISTS tiktok_label_sku_history (tiktok_sku_id text PRIMARY KEY, product_name text NOT NULL, variation text NOT NULL DEFAULT '', seller_sku text NOT NULL UNIQUE, updated_at timestamptz NOT NULL DEFAULT now())`;
 const rows=await sql`SELECT id,tiktok_sku_id,product_name,variation,seller_sku FROM tiktok_label_catalog`;
 const hist=await sql`SELECT seller_sku FROM tiktok_label_sku_history`;
 const used=new Set([...rows,...hist].map((r:any)=>String(r.seller_sku||"").toUpperCase()).filter(Boolean));
 const missing=rows.filter((r:any)=>!r.seller_sku);let generated=0;
 for(const row of missing){let sku="";do{sku=makeSku()}while(used.has(sku));used.add(sku);await sql`UPDATE tiktok_label_catalog SET seller_sku=${sku},sku_source='AUTO',updated_at=now() WHERE id=${row.id}::uuid AND seller_sku IS NULL`;if(row.tiktok_sku_id)await sql`INSERT INTO tiktok_label_sku_history(tiktok_sku_id,product_name,variation,seller_sku,updated_at) VALUES(${row.tiktok_sku_id},${row.product_name},${row.variation||""},${sku},now()) ON CONFLICT(tiktok_sku_id) DO UPDATE SET product_name=EXCLUDED.product_name,variation=EXCLUDED.variation,seller_sku=EXCLUDED.seller_sku,updated_at=now()`;generated++}
 return NextResponse.json({generated});
}
