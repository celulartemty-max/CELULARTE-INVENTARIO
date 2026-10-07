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
 const wb=XLSX.read(Buffer.from(String(src[0].file_base64),"base64"),{type:"buffer",cellDates:false,cellText:true});
 const ws=wb.Sheets["Template"];if(!ws)return NextResponse.json({error:"El Excel original no contiene la hoja Template"},{status:400});
 const rows=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:"",raw:false});
 let headerRow=-1,skuCol=-1,tidCol=-1,productCol=-1,variationCol=-1;
 for(let r=0;r<Math.min(rows.length,20);r++){const vals=(rows[r]||[]).map(norm);vals.forEach((v,i)=>{const k=v.toLowerCase();if(k==="sku de vendedor")skuCol=i;if(k==="id de sku")tidCol=i;if(k==="nombre del producto")productCol=i;if(k==="opción de variación"||k==="opcion de variacion")variationCol=i});if(skuCol>=0&&tidCol>=0){headerRow=r;break}}
 if(headerRow<0)return NextResponse.json({error:"No se encontraron las columnas originales de TikTok"},{status:400});
 const catalog=await sql`SELECT product_name,variation,tiktok_sku_id,seller_sku FROM tiktok_label_catalog WHERE seller_sku IS NOT NULL`;
 const byTid=new Map(catalog.map((x:any)=>[String(x.tiktok_sku_id||""),String(x.seller_sku)]));
 const byPV=new Map(catalog.map((x:any)=>[String(x.product_name)+"|||"+String(x.variation||""),String(x.seller_sku)]));
 let updated=0;
 for(let r=headerRow+1;r<rows.length;r++){const vals=(rows[r]||[]).map(norm);const current=vals[skuCol]||"";if(current)continue;const tid=vals[tidCol]||"";const key=(vals[productCol]||"")+"|||"+(vals[variationCol]||"");const sku=byTid.get(tid)||byPV.get(key);if(!sku)continue;const addr=XLSX.utils.encode_cell({r,c:skuCol});ws[addr]={t:"s",v:sku};updated++}
 const out=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
 const base=String(src[0].filename||"TikTok.xlsx").replace(/\.xlsx?$/i,"");
 const filename=(base+"_SKU_ACTUALIZADOS.xlsx").replace(/[^a-zA-Z0-9._-]+/g,"_");
 return new NextResponse(out,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${filename}"`,"x-skus-updated":String(updated)}});
}
