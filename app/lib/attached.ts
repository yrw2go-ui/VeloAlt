// 💍 Who else is in her life. Single, seeing someone, or married — and what that does to the two
// of you: slower to fall for you while she's attached, more careful about where and when, and the
// odd stretch where she's with them instead. None of it ever makes her cruel or cold with you.
import { sql } from "./db";
import { scrub } from "./secrets";

import { type Her } from "./attachedWords";
export * from "./attachedWords";

/** 🎲 A single woman now and then meets someone. Short, always: weeks to a few months. */
export async function maybeStartDating(userId: string, c: Her): Promise<boolean> {
  if (!c.sees_others || c.attached !== "single") return false;
  if (Math.random() > 0.02) return false; // ~once in fifty chats
  const weeks = 2 + Math.floor(Math.random() * 14); // 2–15 weeks
  const until = new Date(Date.now() + weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  await sql()`update chat_characters set attached = 'dating', attached_since = current_date, attached_until = ${until} where id = ${c.id}`;
  return true;
}

/** 🎲 And it ends — or, for a marriage, now and then it ends in a divorce. */
export async function maybeEndIt(c: Her): Promise<"ended" | "divorced" | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (c.attached === "dating" && c.attached_until && c.attached_until <= today) {
    await sql()`update chat_characters set attached = 'single', partner = '', attached_since = null, attached_until = null where id = ${c.id}`;
    return "ended";
  }
  // 💔 A marriage can end, rarely — about once in a thousand conversations.
  if (c.attached === "married" && Math.random() < 0.001) {
    await sql()`update chat_characters set attached = 'single', partner = '', attached_since = null, attached_until = null where id = ${c.id}`;
    return "divorced";
  }
  return null;
}


export const cleanPartner = (s: unknown) => scrub(String(s ?? "").replace(/\s+/g, " ").trim()).slice(0, 120);

/** ⚢ Off comes the tick. */
export const wonOver = (characterId: string) =>
  sql()`update chat_characters set lesbian = false, updated_at = now() where id = ${characterId}`;
