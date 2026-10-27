import "server-only";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "./session";
import type { SessionUser } from "./types";
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  // A disabled account or a changed branch/role must not keep its old access
  // until the 12-hour cookie expires.
  const rows = await sql`SELECT id::text,email,name,role::text,status::text,primary_branch_id::text FROM users WHERE id=${session.user.id}::uuid`;
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') redirect('/login');
  return { id:String(user.id),email:String(user.email),name:String(user.name),role:user.role as SessionUser['role'],primaryBranchId:user.primary_branch_id ? String(user.primary_branch_id) : null };
}
export const isAdmin = (u: SessionUser) => u.role === "MASTER";
export async function getAuthorizedBranchIds(user: SessionUser): Promise<string[] | null> { if (isAdmin(user)) return null; const rows = await sql`SELECT branch_id::text AS id FROM temporary_branch_access WHERE user_id=${user.id}::uuid AND starts_at <= now() AND ends_at >= now() AND cancelled_at IS NULL`; return [...new Set([...(user.primaryBranchId ? [user.primaryBranchId] : []), ...rows.map((r) => String(r.id))])]; }
export async function assertBranchAccess(user: SessionUser, branchId: string) { const allowed = await getAuthorizedBranchIds(user); if (allowed !== null && !allowed.includes(branchId)) throw new Error("FORBIDDEN_BRANCH"); }

export async function getModulePermissions(user: SessionUser): Promise<string[] | null> { if (isAdmin(user)) return null; try { const rows=await sql`SELECT module FROM user_module_permissions WHERE user_id=${user.id}::uuid`; return rows.map((r)=>String(r.module)); } catch { return []; } }
export async function hasModulePermission(user: SessionUser,module:string): Promise<boolean> { const p=await getModulePermissions(user); return p===null||p.includes(module); }
