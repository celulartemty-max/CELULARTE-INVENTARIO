import {NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";
export async function GET(){
 const u=await requireUser();if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
 const rows=await sql`SELECT product_id,product_name,variation,tiktok_sku_id,seller_sku FROM tiktok_label_catalog ORDER BY product_name,variation`;
 const data=[["ID del producto","Nombre del producto","ID de SKU","Opción de variación","SKU de vendedor"],...rows.map((r:any)=>[r.product_id||"",r.product_name,r.tiktok_sku_id||"",r.variation||"",r.seller_sku||""])];
 const ws=XLSX.utils.aoa_to_sheet(data);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Template");const out=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 return new NextResponse(out,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":'attachment; filename="TikTok_SKU_actualizados.xlsx"'}});
}
