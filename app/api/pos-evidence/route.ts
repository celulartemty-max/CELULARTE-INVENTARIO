import {requireUser,assertBranchAccess} from "@/lib/auth/authorization";
import {sql} from "@/lib/db";

const allowedPath=/^\/(entradas|devoluciones|salidas|traspasos)\/[0-9a-f-]+\/?$/i;

export async function POST(req:Request){
  try{
    const user=await requireUser();
    const body=await req.json() as {movementId?:unknown;evidence?:unknown;context?:unknown;pathname?:unknown};
    const movementId=String(body.movementId||"");
    const evidence=String(body.evidence||"");
    const context=String(body.context||"").slice(0,300);
    const pathname=String(body.pathname||"").slice(0,200);
    if(!/^[0-9a-f-]{36}$/i.test(movementId))throw new Error("MOVEMENT_REQUIRED");
    if(!allowedPath.test(pathname))throw new Error("INVALID_MOVEMENT_PATH");
    if(!evidence.startsWith("data:image/jpeg;base64,")||evidence.length<1000||evidence.length>2_500_000)throw new Error("INVALID_POS_EVIDENCE");

    const rows=await sql`SELECT m.branch_id::text,m.movement_type::text,t.origin_branch_id::text,t.destination_branch_id::text FROM inventory_movements m LEFT JOIN transfers t ON t.movement_id=m.id WHERE m.id=${movementId}::uuid`;
    const movement=rows[0];if(!movement)throw new Error("NOT_FOUND");
    let branchId=String(movement.branch_id);
    if(String(movement.movement_type)==="TRANSFER"){
      const destination=/destino/i.test(context);
      branchId=String(destination?movement.destination_branch_id:movement.origin_branch_id);
    }
    await assertBranchAccess(user,branchId);

    await sql`INSERT INTO audit_events(user_id,branch_id,movement_id,action,new_value) VALUES(${user.id}::uuid,${branchId}::uuid,${movementId}::uuid,'POS_EVIDENCE_CAPTURED',jsonb_build_object('image',${evidence}::text,'context',${context}::text,'pathname',${pathname}::text,'captured_at',now()))`;
    return Response.json({ok:true});
  }catch(error){
    const code=error instanceof Error?error.message:"ERROR";
    const message=code==="INVALID_POS_EVIDENCE"?"La foto no se pudo guardar. Tómala nuevamente.":code==="FORBIDDEN_BRANCH"?"No tienes permiso para registrar esta sucursal.":code;
    return Response.json({error:message},{status:400});
  }
}
