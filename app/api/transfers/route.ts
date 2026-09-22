import{requireUser}from'@/lib/auth/authorization';import{createTransfer,deleteTransferLine,receiveTransfer,registerTransferPos,resolveDifferences,saveTransferLine,sendTransfer}from'@/lib/inventory/transfers';

export async function POST(req:Request){
  try{
    const u=await requireUser(),b=await req.json()as Record<string,unknown>;
    switch(b.action){
      case'create':return Response.json({id:await createTransfer(u,String(b.origin),String(b.destination),String(b.kind||'TRANSFER')as'TRANSFER'|'SALE')});
      case'saveLine':await saveTransferLine(u,String(b.movementId),{lineId:b.lineId?String(b.lineId):undefined,productId:String(b.productId),quantity:Number(b.quantity),saleAmount:b.saleAmount===undefined||b.saleAmount===null||b.saleAmount===''?undefined:Number(b.saleAmount)});break;
      case'deleteLine':await deleteTransferLine(u,String(b.movementId),String(b.lineId));break;
      case'send':await sendTransfer(u,String(b.movementId));break;
      case'receive':await receiveTransfer(u,String(b.movementId),b.lines as {id:string;received:number;reason?:string}[]);break;
      case'resolve':await resolveDifferences(u,String(b.movementId));break;
      case'pos':await registerTransferPos(u,String(b.movementId),String(b.side)as'origin'|'destination');break;
      default:throw new Error('INVALID_ACTION');
    }
    return Response.json({ok:true});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'ERROR'},{status:400})}
}
