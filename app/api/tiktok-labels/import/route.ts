import {NextRequest,NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";

const norm=(v:unknown)=>String(v??"").trim();
async function ready(){
  await sql`CREATE TABLE IF NOT EXISTS tiktok_label_catalog (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_name text NOT NULL, variation text NOT NULL DEFAULT '', tiktok_sku_id text, seller_sku text, sku_source text NOT NULL DEFAULT 'TIKTOK', updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_name,variation))`;
  await sql`ALTER TABLE tiktok_label_catalog ADD COLUMN IF NOT EXISTS product_id text`;
  await sql`CREATE TABLE IF NOT EXISTS tiktok_label_import_source (id text PRIMARY KEY, filename text NOT NULL, file_base64 text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS tiktok_label_sku_history (tiktok_sku_id text PRIMARY KEY, product_name text NOT NULL, variation text NOT NULL DEFAULT '', seller_sku text NOT NULL UNIQUE, updated_at timestamptz NOT NULL DEFAULT now())`;
}
export async function POST(req:NextRequest){
  try{
    const u=await requireUser();
    if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
    await ready();
    const fd=await req.formData();const file=fd.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Archivo inválido"},{status:400});
    const bytes=await file.arrayBuffer();
    const wb=XLSX.read(bytes,{type:"array",cellDates:false,cellText:true});
    const base64=Buffer.from(bytes).toString("base64");
    await sql`INSERT INTO tiktok_label_import_source(id,filename,file_base64,updated_at) VALUES (\'latest\',${file.name},${base64},now()) ON CONFLICT(id) DO UPDATE SET filename=EXCLUDED.filename,file_base64=EXCLUDED.file_base64,updated_at=now()`;
    const ws=wb.Sheets["Template"];
    if(!ws)return NextResponse.json({error:"No se encontró la hoja Template en el archivo"},{status:400});
    const cellKeys=Object.keys(ws).filter(k=>!k.startsWith("!"));let maxR=0,maxC=0;for(const k of cellKeys){const a=XLSX.utils.decode_cell(k);if(a.r>maxR)maxR=a.r;if(a.c>maxC)maxC=a.c}ws["!ref"]=XLSX.utils.encode_range({r:0,c:0},{r:maxR,c:maxC});const rows=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:"",raw:false});
    let headerRow=-1;const headers=new Map<string,number>();
    for(let r=0;r<Math.min(rows.length,20);r++){
      const vals=(rows[r]||[]).map(norm);
      const found=new Map<string,number>();
      vals.forEach((v,i)=>{const k=v.toLowerCase();if(["id del producto","nombre del producto","id de sku","opción de variación","opcion de variacion","sku de vendedor"].includes(k))found.set(k,i)});
      if(found.has("nombre del producto")&&found.has("sku de vendedor")){headerRow=r;for(const [k,v] of found)headers.set(k,v);break}
    }
    if(headerRow<0)return NextResponse.json({error:"No se encontraron los encabezados de TikTok en la hoja Template"},{status:400});
    const at=(vals:string[],...names:string[])=>{for(const name of names){const i=headers.get(name);if(i!==undefined)return vals[i]||""}return""};
    await sql`INSERT INTO tiktok_label_sku_history(tiktok_sku_id,product_name,variation,seller_sku,updated_at) SELECT DISTINCT ON (tiktok_sku_id) tiktok_sku_id,product_name,variation,seller_sku,now() FROM tiktok_label_catalog WHERE tiktok_sku_id IS NOT NULL AND seller_sku IS NOT NULL ORDER BY tiktok_sku_id,updated_at DESC ON CONFLICT(tiktok_sku_id) DO UPDATE SET product_name=EXCLUDED.product_name,variation=EXCLUDED.variation,seller_sku=EXCLUDED.seller_sku,updated_at=now()`;
    await sql`DELETE FROM tiktok_label_catalog`;
    let imported=0,missingSku=0;
    for(let r=headerRow+1;r<rows.length;r++){
      const vals=(rows[r]||[]).map(norm);
      const product=at(vals,"nombre del producto");
      const productId=at(vals,"id del producto"),variation=at(vals,"opción de variación","opcion de variacion"),tid=at(vals,"id de sku"),seller=at(vals,"sku de vendedor").toUpperCase();
      if(!product||!productId||!tid||["no editable","obligatorio"].includes(product.toLowerCase())||["no editable","obligatorio"].includes(productId.toLowerCase())||["no editable","obligatorio"].includes(tid.toLowerCase()))continue;
      let finalSeller=seller;let source='TIKTOK';
      if(!finalSeller){const hist=await sql`SELECT seller_sku FROM tiktok_label_sku_history WHERE tiktok_sku_id=${tid} LIMIT 1`;if(hist.length){finalSeller=String(hist[0].seller_sku);source='HISTORY'}}
      imported++;if(!finalSeller)missingSku++;
      await sql`INSERT INTO tiktok_label_catalog(product_id,product_name,variation,tiktok_sku_id,seller_sku,sku_source) VALUES(${productId||null},${product},${variation},${tid||null},${finalSeller||null},${source}) ON CONFLICT(product_name,variation) DO UPDATE SET product_id=EXCLUDED.product_id,tiktok_sku_id=EXCLUDED.tiktok_sku_id,seller_sku=EXCLUDED.seller_sku,sku_source=EXCLUDED.sku_source,updated_at=now()`;
      if(finalSeller)await sql`INSERT INTO tiktok_label_sku_history(tiktok_sku_id,product_name,variation,seller_sku,updated_at) VALUES(${tid},${product},${variation},${finalSeller},now()) ON CONFLICT(tiktok_sku_id) DO UPDATE SET product_name=EXCLUDED.product_name,variation=EXCLUDED.variation,seller_sku=EXCLUDED.seller_sku,updated_at=now()`;
    }
    return NextResponse.json({imported,missingSku});
  }catch(error){console.error("TikTok import failed",error);return NextResponse.json({error:"No se pudo leer el Excel de TikTok. Revisa el archivo e intenta nuevamente."},{status:500})}
}