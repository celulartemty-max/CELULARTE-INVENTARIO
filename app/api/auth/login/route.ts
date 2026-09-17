import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/credentials";
import { createSession } from "@/lib/auth/session";
export async function POST(request: Request) { const form = await request.formData(); const email = String(form.get("email") ?? "").trim(); const password = String(form.get("password") ?? ""); const user = await authenticate(email, password); if (!user) return NextResponse.redirect(new URL("/login?error=1", request.url), 303); await createSession(user); return NextResponse.redirect(new URL("/dashboard", request.url), 303); }
