export type AppRole = "MASTER" | "ADMIN" | "OPERATIVE";
export type SessionUser = { id: string; email: string; name: string; role: AppRole; primaryBranchId: string | null };
export type Session = { user: SessionUser; exp: number };
