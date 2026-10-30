export function isMyPendingMovement(row:{created_by?:unknown;type?:unknown;status?:unknown;pos_registered_at?:unknown},userId:string){
 const type=String(row.type),status=String(row.status);
 if(String(row.created_by)!==userId||!(type==='EXIT'||type==='TRANSFER'||type.startsWith('RETURN_')))return false;
 return ['DRAFT','SENT','WAITING_RECEIPT','RECEIVED','RECEIVED_WITH_DIFFERENCES','PENDING_POS','POS_CORRECTION_PENDING'].includes(status)||(status==='CLOSED'&&!row.pos_registered_at);
}
