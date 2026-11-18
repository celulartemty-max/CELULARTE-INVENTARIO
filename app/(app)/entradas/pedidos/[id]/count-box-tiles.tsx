'use client';
import Link from 'next/link';

export type CountTile = {
 id:string; number:string; counted:boolean; difference?:boolean; blocked?:boolean;
 missing?:boolean; current?:boolean; href?:string; attempts?:number;
};
export default function CountBoxTiles({boxes,active,onSelect,disabled=false}:{boxes:CountTile[];active?:string|null;onSelect:(id:string)=>void;disabled?:boolean}){
 return <div className="receivingCartonSquares" aria-label="Todas las cajas del pedido">{boxes.map(box=>{
  const label=box.missing?'Faltante':box.blocked?'Bloqueada':box.difference?'Diferencia':box.counted?'Contada':box.current?'Rec. actual':'Otra rec.';
  const style=box.missing||box.difference?{background:'#fff1f2',borderColor:'#dc2626',color:'#991b1b'}:box.blocked?{background:'#f3f4f6',borderColor:'#6b7280',color:'#374151'}:box.counted?{background:'#f0fdf4',borderColor:'#16a34a',color:'#166534'}:{background:'#eff6ff',borderColor:'#2563eb',color:'#1d4ed8'};
  const content=<><b>{box.number}{box.blocked?' 🔒':box.difference?' ⚠':box.counted?' ✓':''}</b><span style={{fontSize:10,whiteSpace:'nowrap'}}>{label}{!box.counted&&!box.blocked&&(box.attempts??0)>0?` · ${box.attempts}/3`:''}</span></>;
  const common={className:'receivingBoxButton',style:{...style,display:'flex',flexDirection:'column' as const,alignItems:'center' as const,justifyContent:'center' as const},'aria-label':`Caja ${box.number}, ${label}`};
  if(box.missing)return <button key={box.id} type="button" {...common} disabled title="Caja pendiente de llegar">{content}</button>;
  if(box.href)return <Link key={box.id} {...common} href={box.href} style={{...common.style,textDecoration:'none'}} title="Abrir conteo en su recepción">{content}</Link>;
  return <button key={box.id} type="button" {...common} disabled={disabled} aria-pressed={active===box.id} onClick={()=>onSelect(box.id)}>{content}</button>;
 })}</div>;
}
