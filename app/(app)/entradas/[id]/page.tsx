import { requireUser,assertBranchAccess } from "@/lib/auth/authorization";
import { sql } from "@/lib/db";
import ReceptionEditor,{type ReceptionBox,type ReceptionMovement} from "./reception-editor";

export default async function ReceptionPage({params}:{params:Promise<{id:string}>}){
  const u=await requireUser();const {id}=await params;
  const ms=await sql`SELECT m.id::text,m.folio,m.branch_id::text,m.status::text,m.pos_registered_at,m.current_version,r.expected_boxes,r.product_id::text,p.name product_name,b.name branch FROM inventory_movements m JOIN receptions r ON r.movement_id=m.id LEFT JOIN products p ON p.id=r.product_id JOIN branches b ON b.id=m.branch_id WHERE m.id=${id}::uuid AND m.movement_type::text='RECEPTION'`;
  const m=ms[0] as unknown as ReceptionMovement|undefined;
  if(!m)return <p>No encontrada.</p>;
  await assertBranchAccess(u,String(m.branch_id));
  const boxRows=await sql`SELECT b.id::text,b.box_number,b.status::text,COALESCE(jsonb_agg(jsonb_build_object('id',l.id::text,'colorId',l.color_id::text,'model',l.model_reference,'quantity',l.quantity,'color',c.name) ORDER BY l.created_at) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) lines FROM reception_boxes b LEFT JOIN reception_box_lines l ON l.box_id=b.id LEFT JOIN product_colors c ON c.id=l.color_id WHERE b.reception_id=(SELECT id FROM receptions WHERE movement_id=${id}::uuid) GROUP BY b.id ORDER BY b.box_number`;
  const colorRows=m.product_id?await sql`SELECT id::text,name FROM product_colors WHERE product_id=${m.product_id}::uuid AND status::text='ACTIVE' ORDER BY name`:[];
  return <ReceptionEditor movement={m} boxes={boxRows as unknown as ReceptionBox[]} colors={colorRows as unknown as Array<{id:string;name:string}>} role={u.role}/>;
}
