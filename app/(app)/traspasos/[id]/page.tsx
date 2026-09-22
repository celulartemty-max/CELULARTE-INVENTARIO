import{requireUser,getAuthorizedBranchIds}from'@/lib/auth/authorization';import{sql}from'@/lib/db';import TransferEditor,{type Transfer,type TransferLine,type Product}from'./transfer-editor';

export default async function Page({params}:{params:Promise<{id:string}>}){
  const u=await requireUser(),{id}=await params;
  const rows=await sql`SELECT m.id::text,m.folio,m.current_version,t.id::text transfer_id,t.origin_branch_id::text,t.destination_branch_id::text,t.status::text,t.transfer_kind "transferKind",t.sent_at,t.received_at,t.origin_pos_registered_at,t.destination_pos_registered_at,o.name origin,d.name destination FROM inventory_movements m JOIN transfers t ON t.movement_id=m.id JOIN branches o ON o.id=t.origin_branch_id JOIN branches d ON d.id=t.destination_branch_id WHERE m.id=${id}::uuid`,t=rows[0]as unknown as Transfer|undefined;
  if(!t)return <p>No encontrado.</p>;
  const ids=await getAuthorizedBranchIds(u),master=ids===null,canOrigin=master||ids.includes(t.origin_branch_id),canDestination=master||ids.includes(t.destination_branch_id);
  if(!canOrigin&&!canDestination)throw new Error('FORBIDDEN_BRANCH');
  const lines=await sql`SELECT l.id::text,l.product_id::text "productId",l.sent_quantity "sentQuantity",l.received_quantity "receivedQuantity",l.difference,l.difference_reason "differenceReason",l.sale_amount::float8 "saleAmount",p.name product FROM transfer_lines l JOIN products p ON p.id=l.product_id WHERE l.transfer_id=${t.transfer_id}::uuid ORDER BY l.id`;
  const products=await sql`SELECT id::text,name FROM products WHERE status::text='ACTIVE' ORDER BY name`;
  return <TransferEditor transfer={t} lines={lines as unknown as TransferLine[]} products={products as unknown as Product[]} canOrigin={canOrigin} canDestination={canDestination} role={u.role}/>;
}
