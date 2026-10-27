// Who is asking: the signed-in person behind the session cookie.
// Accounts are email + password (scrypt). A session is a random token in an
// httpOnly cookie; only its SHA-256 is stored, so a database leak can't be
// replayed as a login.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest, NextResponse } from "next/server";
import { sql } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "velo_session";
const SESSION_DAYS = 60;

export interface Caller { userId: string; email: string }

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Starts a session for this person and sets the cookie on the response. */
export async function startSession(res: NextResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`insert into sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires.toISOString()})`;
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function endSession(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await sql()`delete from sessions where token_hash = ${hashToken(token)}`;
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** The signed-in person, or null. Also refuses cross-site requests (CSRF). */
export async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  if (!sameOrigin(req)) return null;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql()`select u.id, u.email from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  return rows[0] ? { userId: String(rows[0].id), email: String(rows[0].email) } : null;
}

/** Browsers send Origin on POSTs; it must be this site. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin GETs and non-browser clients; the cookie is SameSite=Lax anyway
  try { return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host")); } catch { return false; }
}
