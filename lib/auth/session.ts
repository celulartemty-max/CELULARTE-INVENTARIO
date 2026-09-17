import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Session, SessionUser } from "./types";
const COOKIE = "celularte_session";
const secret = () => { const value = process.env.AUTH_SECRET; if (!value || value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters"); return new TextEncoder().encode(value); };
export async function createSession(user: SessionUser) { const token = await new SignJWT({ user }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret()); (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 }); }
export async function destroySession() { (await cookies()).delete(COOKIE); }
export async function getSession(): Promise<Session | null> { const token = (await cookies()).get(COOKIE)?.value; if (!token) return null; try { const { payload } = await jwtVerify(token, secret()); return { user: payload.user as SessionUser, exp: payload.exp ?? 0 }; } catch { return null; } }
