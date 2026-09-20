import { NextResponse } from "next/server";
import { requireUser,assertBranchAccess } from "@/lib/auth/authorization";
import { withTransaction } from "@/lib/db";
import { addBox,closeBox,closeReception,createReception,deleteLine,registerPos,upsertLine } from "@/lib/inventory/receptions";

async function removeLastEmptyBox(user:Awaited<ReturnType<typeof requireUser>>,movementId:string){
  return withTransaction(async client=>{
    const result=await client.query<{branch_id:string;status:string;reception_id:string;expected_boxes:number}>(`SELECT m.branch_id::text,m.status::text,r.id::text AS reception_id,r.expected_boxes FROM inventory_movements m JOIN receptions r ON r.movement_id=m.id WHERE m.id=$1::uuid AND m.movement_type='RECEPTION' FOR UPDATE OF m,r`,[movementId]);
    const movement=result.rows[0];
    if(!movement)throw new Error('NOT_FOUND');
    await assertBranchAccess(user,movement.branch_id);
    if(movement.status!=='DRAFT')throw new Error('LOCKED');
    if(movement.expected_boxes<=1)throw new Error('MINIMUM_ONE_BOX');
    const boxes=await client.query<{id:string;box_number:number;status:string;line_count:number}>(`SELECT b.id::text,b.box_number,b.status::text,count(l.id)::int AS line_count FROM reception_boxes b LEFT JOIN reception_box_lines l ON l.box_id=b.id WHERE b.reception_id=$1::uuid GROUP BY b.id ORDER BY b.box_number DESC LIMIT 1 FOR UPDATE OF b`,[movement.reception_id]);
    const box=boxes.rows[0];
    if(!box||box.box_number!==movement.expected_boxes)throw new Error('LAST_BOX_NOT_FOUND');
    if(box.status!=='DRAFT'||box.line_count>0)throw new Error('LAST_BOX_NOT_EMPTY');
    await client.query('DELETE FROM reception_boxes WHERE id=$1::uuid',[box.id]);
    await client.query('UPDATE receptions SET expected_boxes=expected_boxes-1 WHERE id=$1::uuid',[movement.reception_id]);
    await client.query("INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES($1::uuid,$2::uuid,$3::uuid,'RECEPTION_EMPTY_BOX_REMOVED',jsonb_build_object('box_number',$4::int))",[user.id,movement.branch_id,movementId,box.box_number]);
  });
}

export async function POST(req:Request){
  try{
    const u=await requireUser();
    const b=await req.json();
    if(b.action==='create'){
      const id=await createReception(u,String(b.branchId),String(b.productId),Number(b.expectedBoxes));
      return NextResponse.json({ok:true,id});
    }
    if(b.action==='addBox')await addBox(u,String(b.movementId));
    else if(b.action==='removeLastBox')await removeLastEmptyBox(u,String(b.movementId));
    else if(b.action==='closeBox')await closeBox(u,String(b.movementId),String(b.boxId));
    else if(b.action==='saveLine')await upsertLine(u,String(b.movementId),{lineId:b.lineId?String(b.lineId):undefined,boxId:String(b.boxId),colorId:String(b.colorId),modelReference:String(b.modelReference||''),quantity:Number(b.quantity)});
    else if(b.action==='deleteLine')await deleteLine(u,String(b.movementId),String(b.lineId));
    else if(b.action==='close')await closeReception(u,String(b.movementId));
    else if(b.action==='pos')await registerPos(u,String(b.movementId));
    else return NextResponse.json({error:'INVALID_ACTION'},{status:400});
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'ERROR'},{status:400});
  }
}
