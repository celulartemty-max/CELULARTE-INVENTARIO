export type ComparisonBox={id:string;counted_at:string|null};
export type ComparisonItem={carton_id:string;model:string;color:string;counted:number|null;expected?:number|null};
export function countComparison(boxes:ComparisonBox[],items:ComparisonItem[]){
 if(!boxes.length||boxes.some(b=>!b.counted_at))return null;
 const ids=new Set(boxes.map(b=>b.id)),lines=items.filter(l=>ids.has(l.carton_id));
 if(boxes.some(b=>!lines.some(l=>l.carton_id===b.id))||lines.some(l=>typeof l.counted!=='number'||!Number.isSafeInteger(l.counted)||l.counted<0))return null;
 const groups=new Map<string,{model:string;color:string;expected:number;counted:number;unknown:number}>();
 let counted=0,expected=0,unknown=0;
 for(const l of lines){
  const model=l.model.trim().toLocaleUpperCase('es-MX'),color=l.color.trim().toLocaleUpperCase('es-MX'),key=JSON.stringify([model,color]);
  const row=groups.get(key)??{model,color,expected:0,counted:0,unknown:0};
  row.counted+=l.counted!;counted+=l.counted!;
  if(typeof l.expected==='number'&&Number.isSafeInteger(l.expected)&&l.expected>=0){row.expected+=l.expected;expected+=l.expected;}
  else{row.unknown++;unknown++;}
  groups.set(key,row);
 }
 const rows=Array.from(groups.values()).map(r=>({...r,difference:r.unknown?null:r.counted-r.expected})).sort((a,b)=>a.model.localeCompare(b.model,'es',{numeric:true})||a.color.localeCompare(b.color,'es'));
 const missing=rows.reduce((sum,r)=>sum+Math.max(0,-(r.difference??0)),0),extra=rows.reduce((sum,r)=>sum+Math.max(0,r.difference??0),0);
 return {counted,expected:unknown?null:expected,difference:unknown?null:counted-expected,unknown,missing,extra,rows:rows.filter(r=>r.difference!==0)};
}
