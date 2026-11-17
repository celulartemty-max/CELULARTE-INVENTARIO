import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {requireUser} from '@/lib/auth/authorization';
import {exportTikTokSkus} from '@/lib/inventory/tiktok-sku-export';

export async function GET(){
 const u=await requireUser();if(u.role!=='MASTER')return NextResponse.json({error:'Sin permiso'},{status:403});
 try{
  // A single read snapshot keeps source and assigned catalog consistent.
  const source=await sql`SELECT filename,file_base64,(SELECT COALESCE(jsonb_agg(jsonb_build_object('tiktok_sku_id',tiktok_sku_id,'seller_sku',seller_sku)),'[]'::jsonb) FROM tiktok_label_catalog) catalog FROM tiktok_label_import_source WHERE id='latest' LIMIT 1`;
  if(!source.length)return NextResponse.json({error:'Primero importa el Excel original de TikTok.'},{status:400});
  const {output,updated,verified}=await exportTikTokSkus(Buffer.from(String(source[0].file_base64),'base64'),source[0].catalog as {tiktok_sku_id:unknown;seller_sku:unknown}[]);
  const filename=(String(source[0].filename||'TikTok.xlsx').replace(/\.xlsx?$/i,'')+'_SKU_ACTUALIZADOS.xlsx').replace(/[^a-zA-Z0-9._-]+/g,'_');
  return new NextResponse(Buffer.from(output),{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${filename}"`,'x-skus-updated':String(updated),'x-skus-verified':String(verified),'cache-control':'private, no-store'}});
 }catch(error){
  console.error('TikTok SKU export failed',error);
  return NextResponse.json({error:error instanceof Error?error.message:'No se pudo verificar la plantilla de TikTok.'},{status:400,headers:{'cache-control':'no-store'}});
 }
}
