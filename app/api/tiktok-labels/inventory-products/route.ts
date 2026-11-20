import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {requireUser,hasModulePermission} from '@/lib/auth/authorization';
export async function GET(){
 try{const u=await requireUser();if(!await hasModulePermission(u,'SALIDAS'))return NextResponse.json({error:'Sin permiso'},{status:403});
 const rows=await sql`SELECT id::text,name FROM products WHERE status::text='ACTIVE' ORDER BY name`;
 return NextResponse.json(rows);
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Error'},{status:400});}
}
