import {NextRequest,NextResponse} from "next/server";
import * as XLSX from "xlsx";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";

const norm=(v:unknown)=>String(v??"").trim();
async function ready(){
  await sql`CREATE TABLE IF NOT EXISTS tiktok_label_catalog (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_name text NOT NULL, variation text NOT NULL DEFAULT '', tiktok_sku_id text, seller_sku text, sku_source text NOT NULL DEFAULT 'TIKTOK', updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_name,variation))`;
  await sql`ALTER TABLE tiktok_label_catalog ADD COLUMN IF NOT EXISTS product_id text`;
}
export async function POST(req:NextRequest){
  try{
    const u=await requireUser();
    if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
    await ready();
    const fd=await req.formData();const file=fd.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Archivo inválido"},{status:400});
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:false,cellText:true});
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
    await sql`DELETE FROM tiktok_label_catalog WHERE product_name IN ('No editable','Obligatorio')`;
    let imported=0,missingSku=0;
    for(let r=headerRow+1;r<rows.length;r++){
      const vals=(rows[r]||[]).map(norm);
      const product=at(vals,"nombre del producto");
      const productId=at(vals,"id del producto"),variation=at(vals,"opción de variación","opcion de variacion"),tid=at(vals,"id de sku"),seller=at(vals,"sku de vendedor").toUpperCase();
      if(!product||!productId||!tid||["no editable","obligatorio"].includes(product.toLowerCase())||["no editable","obligatorio"].includes(productId.toLowerCase())||["no editable","obligatorio"].includes(tid.toLowerCase()))continue;
      imported++;if(!seller)missingSku++;
      await sql`INSERT INTO tiktok_label_catalog(product_id,product_name,variation,tiktok_sku_id,seller_sku,sku_source) VALUES(${productId||null},${product},${variation},${tid||null},${seller||null},'TIKTOK') ON CONFLICT(product_name,variation) DO UPDATE SET product_id=COALESCE(EXCLUDED.product_id,tiktok_label_catalog.product_id),tiktok_sku_id=COALESCE(EXCLUDED.tiktok_sku_id,tiktok_label_catalog.tiktok_sku_id),seller_sku=CASE WHEN tiktok_label_catalog.sku_source='MANUAL' THEN tiktok_label_catalog.seller_sku ELSE COALESCE(EXCLUDED.seller_sku,tiktok_label_catalog.seller_sku) END,updated_at=now()`;
    }
    return NextResponse.json({imported,missingSku});
  }catch(error){console.error("TikTok import failed",error);return NextResponse.json({error:"No se pudo leer el Excel de TikTok. Revisa el archivo e intenta nuevamente."},{status:500})}
}