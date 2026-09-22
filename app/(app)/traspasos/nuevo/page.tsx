import{requireUser,getAuthorizedBranchIds}from'@/lib/auth/authorization';import{sql}from'@/lib/db';import NewTransfer,{type BranchOption}from'./transfer-new';

export default async function Page(){
  const u=await requireUser(),ids=await getAuthorizedBranchIds(u);
  const all=await sql`SELECT id::text,name,(name IN ('Treviño','Plaza del Audio')) "isInternal" FROM branches WHERE status::text='ACTIVE' ORDER BY CASE WHEN name IN ('Treviño','Plaza del Audio') THEN 0 ELSE 1 END,name`;
  const internal=all.filter(b=>Boolean(b.isInternal));
  const origins=ids===null?internal:internal.filter(b=>ids.includes(String(b.id)));
  return <><header><h1>Nuevo envío</h1><p>Selecciona la sucursal que envía y el destino.</p></header><NewTransfer origins={origins as unknown as BranchOption[]} destinations={all as unknown as BranchOption[]}/></>;
}
