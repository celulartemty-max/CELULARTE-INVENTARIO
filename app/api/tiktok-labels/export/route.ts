import {NextResponse} from "next/server";
import JSZip from "jszip";
import {sql} from "@/lib/db";
import {requireUser} from "@/lib/auth/authorization";

const unescapeXml=(s:string)=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const escapeXml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const cellValue=(xml:string,shared:string[])=>{
 const t=(xml.match(/<c\b[^>]*\bt="([^"]+)"/)||[])[1]||"";
 if(t==="inlineStr"){const m=xml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);return m?unescapeXml(m[1]):""}
 const m=xml.match(/<v>([\s\S]*?)<\/v>/);if(!m)return"";
 const v=unescapeXml(m[1]);return t==="s"?(shared[Number(v)]||""):v;
};
export async function GET(){
 const u=await requireUser();if(u.role!=="MASTER")return NextResponse.json({error:"Sin permiso"},{status:403});
 await sql`CREATE TABLE IF NOT EXISTS tiktok_label_import_source (id text PRIMARY KEY, filename text NOT NULL, file_base64 text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
 const src=await sql`SELECT filename,file_base64 FROM tiktok_label_import_source WHERE id='latest' LIMIT 1`;
 if(!src.length)return NextResponse.json({error:"Primero importa el Excel original de TikTok"},{status:400});
 const original=Buffer.from(String(src[0].file_base64),"base64");
 const zip=await JSZip.loadAsync(original);
 const workbookXml=await zip.file("xl/workbook.xml")?.async("string");
 const relsXml=await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
 if(!workbookXml||!relsXml)return NextResponse.json({error:"El archivo de TikTok no tiene una estructura XLSX válida"},{status:400});
 const sheetTag=(workbookXml.match(/<sheet\b[^>]*name="Template"[^>]*\/>/)||[])[0];
 const relId=(sheetTag?.match(/r:id="([^"]+)"/)||[])[1];
 const target=relId?(relsXml.match(new RegExp('<Relationship\\b[^>]*Id="'+relId.replace(/[.*+?^$()|[\\]\\]/g,"\\$&")+'"[^>]*Target="([^"]+)"[^>]*/>'))||[])[1]:"";
 const sheetPath=target?("xl/"+target.replace(/^\//,"").replace(/^xl\//,"")):"";
 if(!sheetPath||!zip.file(sheetPath))return NextResponse.json({error:"No se encontró la hoja Template en el Excel original"},{status:400});
 const sharedXml=await zip.file("xl/sharedStrings.xml")?.async("string")||"";
 const shared=[...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>unescapeXml([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join("")));
 let sheetXml=await zip.file(sheetPath)!.async("string");
 const catalog=await sql`SELECT tiktok_sku_id,seller_sku FROM tiktok_label_catalog WHERE seller_sku IS NOT NULL AND tiktok_sku_id IS NOT NULL`;
 const byTid=new Map(catalog.map((x:any)=>[String(x.tiktok_sku_id).trim(),String(x.seller_sku).trim()]));
 let updated=0;
 sheetXml=sheetXml.replace(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g,(row:string,rowNum:string)=>{
   const cells=[...row.matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g)];
   const d=cells.find(m=>m[1]==="D")?.[0];const g=cells.find(m=>m[1]==="G")?.[0];
   if(!d)return row;const tid=cellValue(d,shared).trim();const sku=byTid.get(tid);if(!sku)return row;
   if(g&&cellValue(g,shared).trim())return row;
   const replacement=g?g.replace(/(<c\b[^>]*)(?:\bt="[^"]*")?([^>]*>)[\s\S]*?<\/c>/,(_m:string,a:string,b:string)=>a.replace(/\s+t="[^"]*"/g,"")+b.replace(/>$/, ' t="inlineStr">')+"<is><t>"+escapeXml(sku)+"</t></is></c>"):`<c r="G${rowNum}" t="inlineStr"><is><t>${escapeXml(sku)}</t></is></c>`;
   updated++;return g?row.replace(g,replacement):row.replace("</row>",replacement+"</row>");
 });
 zip.file(sheetPath,sheetXml);
 const out=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
 const base=String(src[0].filename||"TikTok.xlsx").replace(/\.xlsx?$/i,"");
 const filename=(base+"_SKU_ACTUALIZADOS.xlsx").replace(/[^a-zA-Z0-9._-]+/g,"_");
 return new NextResponse(Buffer.from(out),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${filename}"`,"x-skus-updated":String(updated),"cache-control":"no-store"}});
}
