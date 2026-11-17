import JSZip from 'jszip';

type AssignedSku={tiktok_sku_id:unknown;seller_sku:unknown};
const decode=(s:string)=>s.replace(/&#(x[\da-f]+|\d+);|&(lt|gt|amp|quot|apos);/gi,(_all,n:string,k:string)=>n?String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)):({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[k.toLowerCase()]??''));
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const attr=(s:string,key:string)=>{const m=s.match(new RegExp('\\b'+key+'\\s*=\\s*(["\x27])([\\s\\S]*?)\\1'));return m?decode(m[2]):'';};
const tags=(xml:string,name:string)=>[...xml.matchAll(new RegExp('<'+name+'\\b[^>]*>','g'))].map(m=>m[0]);
const texts=(xml:string)=>[...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>decode(m[1])).join('');
const cells=(row:string)=>[...row.matchAll(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)].map(m=>({xml:m[0],index:m.index!,ref:attr(m[0].split('>')[0], 'r')}));
function value(xml:string,shared:string[]){
 const head=xml.slice(0,xml.indexOf('>')+1),type=attr(head,'t');
 if(type==='inlineStr')return texts(xml);
 const raw=decode(xml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]??'');
 if(type==='s')return shared[Number(raw)]??'';
 return raw;
}
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const columnNumber=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
function getColumns(row:string,shared:string[]){
 const c=cells(row),tid=c.filter(x=>['id de sku','sku id'].includes(norm(value(x.xml,shared)))),sku=c.filter(x=>['sku de vendedor','seller sku'].includes(norm(value(x.xml,shared))));
 if(tid.length>1||sku.length>1)throw Error('La plantilla tiene encabezados de SKU repetidos.');
 return tid.length===1&&sku.length===1?{tid:tid[0].ref.replace(/\d+$/,''),sku:sku[0].ref.replace(/\d+$/,'')}:null;
}
function replaceSku(row:string,rowNumber:string,column:string,sku:string){
 const ref=column+rowNumber,found=cells(row).filter(c=>c.ref===ref);
 if(found.length>1)throw Error(`La plantilla tiene una celda duplicada: ${ref}.`);
 const old=found[0];
 // Keep style and cell metadata; only the seller-SKU cell's value/type changes.
 const attributes=old?old.xml.slice(2,old.xml.indexOf('>')).replace(/\/\s*$/,'').replace(/\s+t\s*=\s*(["'])[\s\S]*?\1/g,''):` r="${ref}"`;
 const replacement=`<c${attributes} t="inlineStr"><is><t>${escape(sku)}</t></is></c>`;
 if(old)return row.slice(0,old.index)+replacement+row.slice(old.index+old.xml.length);
 // Excel expects cells in column order. Do not append G after later columns.
 const next=cells(row).find(c=>columnNumber(c.ref.replace(/\d+$/,''))>columnNumber(column));
 return next?row.slice(0,next.index)+replacement+row.slice(next.index):row.replace('</row>',replacement+'</row>');
}

/** Patch the original XLSX package, never recreate the workbook or its other fields. */
export async function exportTikTokSkus(original:Uint8Array,assigned:AssignedSku[]){
 const zip=await JSZip.loadAsync(original);
 const workbook=await zip.file('xl/workbook.xml')?.async('string');
 const rels=await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
 if(!workbook||!rels)throw Error('El archivo original no es una plantilla XLSX válida.');
 const sheet=tags(workbook,'sheet').find(t=>norm(attr(t,'name'))==='template');
 const relation=sheet?tags(rels,'Relationship').find(t=>attr(t,'Id')===attr(sheet,'r:id')):undefined;
 const target=relation?attr(relation,'Target').replace(/\\/g,'/'):'';
 const parts:string[]=[];for(const part of (target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target).split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}
 const path=parts.join('/');
 if(!target||!path.startsWith('xl/')||!zip.file(path))throw Error('No se encontró la hoja Template en el Excel original.');
 const sharedXml=await zip.file('xl/sharedStrings.xml')?.async('string')??'';
 const shared=[...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>texts(m[1]));
 const source=await zip.file(path)!.async('string');
 const rows=[...source.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)];
 let header=-1,columns:ReturnType<typeof getColumns>=null;
 for(let i=0;i<Math.min(rows.length,20);i++){columns=getColumns(rows[i][0],shared);if(columns){header=i;break;}}
 if(header<0||!columns)throw Error('No se encontraron ID de SKU y SKU de vendedor en la hoja Template.');
 const expected=new Map<string,string>();
 for(const row of assigned){const id=String(row.tiktok_sku_id??'').trim(),sku=String(row.seller_sku??'').trim();if(!id||!sku)continue;if(expected.has(id)&&expected.get(id)!==sku)throw Error(`El ID de SKU ${id} tiene asignaciones contradictorias en el catálogo.`);expected.set(id,sku);}
 if(!expected.size)throw Error('No hay SKU asignados para exportar.');
 const seen=new Set<string>();const changes=new Map<string,string>();let updated=0;
 for(let i=header+1;i<rows.length;i++){
  const row=rows[i][0],number=attr(row.slice(0,row.indexOf('>')+1),'r');
  const ids=cells(row).filter(c=>c.ref===columns!.tid+number);if(ids.length>1)throw Error(`Hay un ID duplicado en la fila ${number}.`);
  const id=ids.length?value(ids[0].xml,shared).trim():'';if(!id||['no editable','obligatorio'].includes(norm(id)))continue;
  if(seen.has(id))throw Error(`El ID de SKU ${id} aparece más de una vez en la plantilla.`);seen.add(id);
  const sku=expected.get(id);if(!sku)throw Error(`El ID de SKU ${id} no tiene SKU de vendedor asignado en el catálogo. Genera los faltantes o importa la plantilla correspondiente.`);
  const previous=cells(row).find(c=>c.ref===columns!.sku+number);
  if(previous&&value(previous.xml,shared)===sku)continue;
  changes.set(number,sku);updated++;
 }
 const missing=[...expected.keys()].filter(id=>!seen.has(id));
 if(missing.length)throw Error(`${missing.length} SKU del catálogo no se encontraron en esta plantilla. Importa la plantilla correspondiente antes de descargar.`);
 const result=source.replace(/<row\b[^>]*>[\s\S]*?<\/row>/g,row=>{const number=attr(row.slice(0,row.indexOf('>')+1),'r');return changes.has(number)?replaceSku(row,number,columns!.sku,changes.get(number)!):row;});
 // Verify every assignment in the patched XML before returning any download.
 const verified=new Set<string>();
 for(const match of result.matchAll(/<row\b[^>]*>[\s\S]*?<\/row>/g)){
  const row=match[0],number=attr(row.slice(0,row.indexOf('>')+1),'r'),all=cells(row),idCell=all.find(c=>c.ref===columns!.tid+number);
  const id=idCell?value(idCell.xml,shared).trim():'';if(!expected.has(id))continue;
  const skus=all.filter(c=>c.ref===columns!.sku+number);
  if(skus.length!==1||value(skus[0].xml,shared)!==expected.get(id))throw Error(`No se pudo verificar el SKU de la fila ${number}. No se descargó ningún archivo.`);
  verified.add(id);
 }
 if(verified.size!==expected.size)throw Error('No se pudieron verificar todos los SKU. No se descargó ningún archivo.');
 if(updated)zip.file(path,result);
 const output=updated?await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}):original;
 return {output,updated,verified:verified.size};
}
