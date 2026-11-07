export function groupPendingExitRows(rows:Record<string,unknown>[]){
 const grouped:Record<string,unknown>[]=[],seen=new Map<string,Record<string,unknown>>();
 for(const row of rows){
  if(!row.full_order_id){grouped.push(row);continue;}
  const key=String(row.full_order_id),existing=seen.get(key);
  if(existing){existing.branch=[...new Set([...String(existing.branch).split(' + '),String(row.branch)])].join(' + ');continue;}
  const first={...row};seen.set(key,first);grouped.push(first);
 }
 return grouped;
}
