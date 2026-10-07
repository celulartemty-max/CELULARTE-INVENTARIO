import {NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";
const norm=(v:unknown)=>String(v??"").trim();
export async function GET(){
 const u=await requireUser();if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
 await sql`CREATE TABLE IF NOT EXISTS tiktok_label_import_source (id text PRIMARY KEY, filename text NOT NULL, file_base64 text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
 const src=await sql`SELECT filename,file_base64 FROM tiktok_label_import_source WHERE id='latest' LIMIT 1`;
 if(!src.length)return NextResponse.json({error:"Primero importa el Excel original de TikTok"},{status:400});
 const original=Buffer.from(String(src[0].file_base64),"base64");
 const wb=XLSX.read(original,{type:"buffer",cellDates:false,cellText:true,dense:false});
 const ws=wb.Sheets["Template"];if(!ws)return NextResponse.json({error:"El Excel original no contiene la hoja Template"},{status:400});
 const cells=Object.keys(ws).filter(k=>!k.startsWith("!"));let maxR=0,maxC=0;
 for(const k of cells){const a=XLSX.utils.decode_cell(k);if(a.r>maxR)maxR=a.r;if(a.c>maxC)maxC=a.c}
 let headerRow=-1,skuCol=-1,tidCol=-1;
 for(let r=0;r<=Math.min(maxR,20);r++){for(let col=0;col<=maxC;col++){const v=norm(ws[XLSX.utils.encode_cell({r,c:col})]?.v).toLowerCase();if(v==="sku de vendedor")skuCol=col;if(v==="id de sku")tidCol=col}if(skuCol>=0&&tidCol>=0){headerRow=r;break}}
 if(headerRow<0)return NextResponse.json({error:"No se encontraron las columnas originales de TikTok"},{status:400});
 const catalog=await sql`SELECT tiktok_sku_id,seller_sku FROM tiktok_label_catalog WHERE seller_sku IS NOT NULL AND tiktok_sku_id IS NOT NULL`;
 const byTid=new Map(catalog.map((x:any)=>[String(x.tiktok_sku_id),String(x.seller_sku)]));
 let updated=0;
 for(let r=headerRow+1;r<=maxR;r++){const tid=norm(ws[XLSX.utils.encode_cell({r,c:tidCol})]?.v);if(!tid)continue;const skuAddr=XLSX.utils.encode_cell({r,c:skuCol});const current=norm(ws[skuAddr]?.v);if(current)continue;const sku=byTid.get(tid);if(!sku)continue;const old=ws[skuAddr]||{};ws[skuAddr]={...old,t:"s",v:sku,w:sku};updated++}
 const out=XLSX.write(wb,{type:"buffer",bookType:"xlsx",bookSST:false});
 const base=String(src[0].filename||"TikTok.xlsx").replace(/\.xlsx?$/i,"");
 const filename=(base+"_SKU_ACTUALIZADOS.xlsx").replace(/[^a-zA-Z0-9._-]+/g,"_");
 return new NextResponse(out,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${filename}"`,"x-skus-updated":String(updated),"cache-control":"no-store"}});
}
