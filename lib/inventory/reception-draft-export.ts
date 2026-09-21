import "server-only";
import { sql } from "@/lib/db";
import { assertBranchAccess } from "@/lib/auth/authorization";
import type { SessionUser } from "@/lib/auth/types";

type Snapshot={movement:Record<string,unknown>;reception:Record<string,unknown>;boxes:Array<{box:Record<string,unknown>;lines:Array<Record<string,unknown>>}>};

export async function getDraftClosedBoxesExport(user:SessionUser,id:string){
  const movements=await sql`SELECT branch_id::text,status::text,folio FROM inventory_movements WHERE id=${id}::uuid AND movement_type='RECEPTION'`;
  const movement=movements[0];
  if(!movement)throw new Error("NOT_FOUND");
  await assertBranchAccess(user,String(movement.branch_id));
  if(String(movement.status)!=='DRAFT')throw new Error("NOT_DRAFT");

  const rows=await sql`
    SELECT jsonb_build_object(
      'movement',to_jsonb(m),
      'reception',to_jsonb(r),
      'boxes',COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'box',to_jsonb(b),
            'lines',COALESCE((
              SELECT jsonb_agg(
                to_jsonb(l)||jsonb_build_object('product_name',p.name,'color_name',c.name)
                ORDER BY l.created_at,l.id
              )
              FROM reception_box_lines l
              JOIN products p ON p.id=l.product_id
              JOIN product_colors c ON c.id=l.color_id
              WHERE l.box_id=b.id
            ),'[]'::jsonb)
          ) ORDER BY b.box_number
        )
        FROM reception_boxes b
        WHERE b.reception_id=r.id AND b.status::text='CLOSED'
      ),'[]'::jsonb)
    ) AS snapshot
    FROM inventory_movements m
    JOIN receptions r ON r.movement_id=m.id
    WHERE m.id=${id}::uuid
  `;
  const snapshot=rows[0]?.snapshot as Snapshot|undefined;
  if(!snapshot||!snapshot.boxes.length)throw new Error("NO_CLOSED_BOXES_TO_EXPORT");
  return {folio:String(movement.folio),snapshot};
}
