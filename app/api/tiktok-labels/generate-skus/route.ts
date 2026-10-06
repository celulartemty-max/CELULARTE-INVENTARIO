import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";
const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeSku(){let s="";for(let i=0;i<7;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
export async function POST(){
 const u=await requireUser();if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
 const rows=await sql`SELECT id,seller_sku FROM tiktok_label_catalog`;const used=new Set(rows.map((r:any)=>String(r.seller_sku||"").toUpperCase()).filter(Boolean));const missing=rows.filter((r:any)=>!r.seller_sku);let generated=0;
 for(const row of missing){let sku="";do{sku=makeSku()}while(used.has(sku));used.add(sku);await sql`UPDATE tiktok_label_catalog SET seller_sku=${sku},sku_source='AUTO',updated_at=now() WHERE id=${row.id}::uuid AND seller_sku IS NULL`;generated++}
 return NextResponse.json({generated});
}
