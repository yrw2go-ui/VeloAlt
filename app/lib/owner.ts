// Who's texting or calling Velo's number: a Velo Pro member, by their verified phone.
import { sql } from "./db";
import type { Caller } from "./caller";
import { scrub } from "./secrets";

export type Owner = Caller & { name: string; timeZone: string | null; phone: string; pro: boolean };

export async function ownerByPhone(from: string): Promise<Owner | null> {
  if (!/^\+1\d{10}$/.test(from)) return null;
  const [u] = await sql()`select id, email, name, time_zone, phone, plan from users where phone = ${from} and phone_verified_at is not null`;
  return u ? { userId: String(u.id), email: String(u.email), name: String(u.name || ""), timeZone: u.time_zone ? String(u.time_zone) : null, phone: String(u.phone), pro: u.plan === "pro" } : null;
}

export async function ownerById(id: string): Promise<Owner | null> {
  const [u] = await sql()`select id, email, name, time_zone, phone, phone_verified_at, plan from users where id = ${id}`;
  return u ? { userId: String(u.id), email: String(u.email), name: String(u.name || ""), timeZone: u.time_zone ? String(u.time_zone) : null, phone: u.phone_verified_at ? String(u.phone) : "", pro: u.plan === "pro" } : null;
}

/** Adds a message to their chat with Velo (so texts and call reports show up in the app). */
export async function addChat(userId: string, role: "user" | "assistant", content: string) {
  const text = scrub(content.trim().slice(0, 8000));
  if (text) await sql()`insert into velo_messages (user_id, role, content) values (${userId}, ${role}, ${text})`;
}
