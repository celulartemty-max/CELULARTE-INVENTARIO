import * as XLSX from 'xlsx';
import {packingSchema} from './receiving-validation';

const label=(v:unknown)=>String(v??'').trim();
const key=(v:unknown)=>label(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[ _.-]+/g,' ');
const empty=(v:unknown)=>v===null||v===undefined||v==='';
function quantity(v:unknown,where:string){
 const n=typeof v==='string'&&/^\d+$/.test(v.trim())?Number(v.trim()):v;
 if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1000000)throw Error(`Cantidad inválida en ${where}. No se importó nada.`);
 return n;
}
function role(v:unknown){
 const k=key(v);
 if(['CTN','CAJA','BOX','CARTON','NUMERO DE CAJA','BOX NO','CTN NO','箱号'].includes(k))return 'box';
 if(['MODEL','MODELO','MODELS','MODELOS'].includes(k))return 'model';
 if(['COLOR','COLOUR'].includes(k))return 'color';
 if(['QUANTITY','QTY','CANTIDAD','PIEZAS','数量'].includes(k))return 'quantity';
 if(['CTN TOTAL','BOX TOTAL','TOTAL CAJA','TOTAL POR CAJA','总数'].includes(k))return 'boxTotal';
 if(['TOTAL','TOTAL PIEZAS'].includes(k))return 'total';
 if(['KG','KGS','WEIGHT','PESO','重量','CM','CBM','DIMENSIONES','MEDIDAS','箱规'].includes(k))return 'metadata';
 return null;
}

// Excel is data, not a prompt. Only explicit, verifiable tables are accepted.
export function readPackingExcel(data:Buffer){
 if(!data.length||data.length>2*1024*1024)throw Error('El Excel debe pesar hasta 2 MB.');
 let inflated=0,entries=0;
 for(let i=0;i+46<=data.length;i++)if(data.readUInt32LE(i)===0x02014b50){
  inflated+=data.readUInt32LE(i+24);entries++;
  if(inflated>20000000||entries>500)throw Error('Excel demasiado grande al descomprimirse.');
  i+=45+data.readUInt16LE(i+28)+data.readUInt16LE(i+30)+data.readUInt16LE(i+32);
 }
 const workbook=XLSX.read(data,{type:'buffer',sheetRows:5001});
 if(workbook.SheetNames.length!==1)throw Error('El Excel debe contener una sola hoja del pedido. Separa las sucursales antes de cargarlo.');
 const name=workbook.SheetNames[0],sheet=workbook.Sheets[name];
 const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 if(range.e.r>=5000||range.e.c>100)throw Error('Excel demasiado extenso. Divídelo por pedido.');
 const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:null,blankrows:true});
 const header=rows.findIndex((row,i)=>i<30&&row.some(v=>role(v)==='box')&&row.some(v=>role(v)==='model'));
 if(header<0)throw Error('No se reconoció la tabla del Excel. Usa encabezados CTN (caja) y MODEL (modelo), con columnas de colores o COLOR y CANTIDAD.');
 const headers=rows[header],roles=headers.map(role);
 for(const r of ['box','model','color','quantity','boxTotal','total'])if(roles.filter(x=>x===r).length>1)throw Error('Hay encabezados de control repetidos en el Excel. Revisa la tabla.');
 const boxCol=roles.indexOf('box'),modelCol=roles.indexOf('model'),colorCol=roles.indexOf('color'),qtyCol=roles.indexOf('quantity'),totalCol=roles.indexOf('total'),boxTotalCol=roles.indexOf('boxTotal');
 if(qtyCol>=0&&totalCol>=0)throw Error('Hay dos totales de fila ambiguos. Usa Quantity para la fila y CTN TOTAL para el total de caja.');
 const wideColors=headers.map((v,c)=>({name:label(v),c})).filter(x=>!roles[x.c]&&x.name);
 if(colorCol>=0&&(qtyCol<0||wideColors.length))throw Error('La tabla COLOR/CANTIDAD tiene columnas sin identificar. Revisa sus encabezados.');
 if(colorCol<0&&(!wideColors.length||(qtyCol<0&&totalCol<0)))throw Error('Faltan colores o una columna Quantity/Total para validar el Excel.');
 const colors:string[]=[],boxes:{number:string;items:{model:string;color:string;expected:number}[]}[]=[],byBox=new Map<string,typeof boxes[number]>(),pairs=new Set<string>(),declared=new Map<string,number>();
 if(colorCol<0){for(const c of wideColors){if(colors.some(v=>key(v)===key(c.name)))throw Error('Hay columnas de color repetidas en el Excel.');colors.push(c.name);}}
 const merged=(r:number,c:number)=>{const cell=rows[r]?.[c];if(!empty(cell))return cell;const m=(sheet['!merges']??[]).find(m=>m.s.c===c&&m.e.c===c&&m.s.r<=r&&m.e.r>=r);return m?rows[m.s.r]?.[c]:cell;};
 let current='',overall:number|undefined,ended=false,total=0;
 for(let r=header+1;r<rows.length;r++){
  const row=rows[r];if(row.every(empty))continue;
  if(row.some((v,c)=>c>=headers.length&&!empty(v))||row.some((v,c)=>!empty(v)&&empty(headers[c])))throw Error(`Hay datos sin encabezado en la fila ${r+1}.`);
  const rawBox=merged(r,boxCol),model=label(merged(r,modelCol));
  const isTotal=['TOTAL','TOTAL GENERAL','合计','总计'].includes(key(rawBox))||['TOTAL','TOTAL GENERAL','合计','总计'].includes(key(model))||(!model&&empty(rawBox));
  if(isTotal){
   if((colorCol>=0&&!empty(row[colorCol]))||(colorCol<0&&wideColors.some(c=>!empty(row[c.c]))))throw Error(`Falta modelo o hay cantidades de colores dentro de un total en la fila ${r+1}.`);
   const n=row[qtyCol>=0?qtyCol:totalCol];
   if(empty(n)||overall!==undefined)throw Error(`Total o fila sin modelo ambiguo en la fila ${r+1}.`);
   overall=quantity(n,`total fila ${r+1}`);ended=true;continue;
  }
  if(ended)throw Error('Hay datos después del total general. Usa una sola tabla por pedido.');
  if(!empty(rawBox)){
   const number=label(rawBox);if(!/^\d+(?:\s*\/\s*\d+)?$/.test(number))throw Error(`Número de caja inválido en la fila ${r+1}.`);
   if(number!==current&&byBox.has(number))throw Error(`La caja ${number} aparece en bloques separados. Revisa la tabla.`);
   current=number;
  }
  if(!current||!model)throw Error(`Falta caja o modelo en la fila ${r+1}.`);
  let box=byBox.get(current);if(!box){box={number:current,items:[]};byBox.set(current,box);boxes.push(box);}
  const source=colorCol>=0?[{name:label(row[colorCol]),c:qtyCol}]:wideColors;
  let rowSum=0,found=false;
  for(const color of source){
   if(empty(row[color.c]))continue;
   if(!color.name)throw Error(`Falta color en la fila ${r+1}.`);
   const n=quantity(row[color.c],`fila ${r+1}, ${color.name}`),pair=JSON.stringify([current,key(model),key(color.name)]);
   if(pairs.has(pair))throw Error(`Modelo/color realmente repetido en la caja ${current}, fila ${r+1}. Revisa las filas de origen; no se sumaron ni eliminaron cantidades.`);
   pairs.add(pair);found=true;rowSum+=n;box.items.push({model,color:color.name,expected:n});
   if(!colors.some(v=>key(v)===key(color.name)))colors.push(color.name);
  }
  if(!found)throw Error(`La fila ${r+1} no tiene cantidades de colores.`);
  if(colorCol<0){const control=qtyCol>=0?qtyCol:totalCol;if(!empty(row[control])&&quantity(row[control],`total fila ${r+1}`)!==rowSum)throw Error(`Los colores no suman el total de la fila ${r+1}.`);}
  if(boxTotalCol>=0&&!empty(row[boxTotalCol])){const n=quantity(row[boxTotalCol],`total caja ${current}`);if(declared.has(current)&&declared.get(current)!==n)throw Error(`La caja ${current} tiene totales distintos.`);declared.set(current,n);}
  total+=rowSum;
 }
 for(const box of boxes)if(declared.has(box.number)&&box.items.reduce((s,l)=>s+l.expected,0)!==declared.get(box.number))throw Error(`Las piezas de la caja ${box.number} no coinciden con su total.`);
 if(overall!==undefined&&overall!==total)throw Error('Las piezas no coinciden con el total general del Excel.');
 return packingSchema.parse({reference:name,colors,warnings:[],boxes});
}
