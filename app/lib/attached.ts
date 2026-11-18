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

/**
 * ⚢ → 💗 She was only ever into women, and this one person changed that. Off comes the tick, and
 * from here she's bisexual: still drawn to women, and drawn to them. She may well stay with her
 * partner — that doesn't make it any less real. Remembered for this person (so her card isn't the
 * only record), and written into her memory in her own words.
 */
export async function wonOver(userId: string, characterId: string): Promise<void> {
  await sql()`update chat_characters set lesbian = false, was_lesbian = true, updated_at = now() where id = ${characterId}`;
  await sql()`insert into chat_relationships (user_id, character_id, won_over) values (${userId}, ${characterId}, now())
    on conflict (user_id, character_id) do update set won_over = coalesce(chat_relationships.won_over, now()), updated_at = now()`;
  await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${characterId}, 'fact',
    ${"I was only ever into women — until him. I'm bisexual now: still drawn to women, and drawn to him."})`;
}

/** ⚢ → 💗 Has she come around — for this person, or on her card? */
export async function cameAround(userId: string, characterId: string): Promise<boolean> {
  const [r] = await sql()`select r.won_over, c.was_lesbian, c.lesbian from chat_characters c
    left join chat_relationships r on r.character_id = c.id and r.user_id = ${userId} where c.id = ${characterId}`;
  return !!r && !r.lesbian && (!!r.won_over || !!r.was_lesbian);
}
