// Large supplier workbooks often consist mostly of embedded product photos.
// Prepare a data-only copy in the browser so requests stay below hosting limits.
export async function preparePackingUpload(file:File):Promise<File>{
 if(!/\.xlsx$/i.test(file.name)||file.size<=2*1024*1024)return file;
 if(file.size>20*1024*1024)throw Error('El Excel debe pesar hasta 20 MB.');
 const data=await file.arrayBuffer(),view=new DataView(data);let inflated=0,entries=0;
 for(let i=0;i+46<=data.byteLength;i++)if(view.getUint32(i,true)===0x02014b50){
  inflated+=view.getUint32(i+24,true);entries++;
  if(inflated>80*1024*1024||entries>500)throw Error('Excel demasiado grande al descomprimirse.');
  i+=45+view.getUint16(i+28,true)+view.getUint16(i+30,true)+view.getUint16(i+32,true);
 }
 const XLSX=await import('xlsx');
 const book=XLSX.read(data,{type:'array'});
 const copy=XLSX.write(book,{type:'array',bookType:'xlsx',compression:true});
 if(copy.byteLength>2*1024*1024)throw Error('Los datos del Excel superan 2 MB incluso sin fotografías.');
 return new File([copy],file.name.replace(/\.xlsx$/i,'-lectura.xlsx'),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
