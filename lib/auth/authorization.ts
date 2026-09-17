import "server-only";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "./session";
import type { SessionUser } from "./types";
export async function requireUser(): Promise<SessionUser> { const s = await getSession(); if (!s) redirect("/login"); return s.user; }
export const isAdmin = (u: SessionUser) => u.role === "MASTER" || u.role === "ADMIN";
export async function getAuthorizedBranchIds(user: SessionUser): Promise<string[] | null> { if (isAdmin(user)) return null; const rows = await sql`SELECT branch_id::text AS id FROM temporary_branch_access WHERE user_id=${user.id}::uuid AND starts_at <= now() AND ends_at >= now() AND cancelled_at IS NULL`; return [...new Set([...(user.primaryBranchId ? [user.primaryBranchId] : []), ...rows.map((r) => String(r.id))])]; }
export async function assertBranchAccess(user: SessionUser, branchId: string) { const allowed = await getAuthorizedBranchIds(user); if (allowed !== null && !allowed.includes(branchId)) throw new Error("FORBIDDEN_BRANCH"); }
