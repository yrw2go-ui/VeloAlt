// 💔 When something hurts her: a sore spell. She goes quieter, shorter, a little further away —
// and it passes. Never more than 48 hours, usually less, and sooner than that if he puts it right.
import { sql } from "./db";
import { scrub } from "./secrets";
import { MAX_HOURS, type Sore } from "./soreWords";
export { MAX_HOURS, soreNote, SORE_REMEMBER, type Sore } from "./soreWords";

const HOURS = { 1: 6, 2: 18, 3: 48 } as const;


/** Is she still sore, and what about? (Expired ones are cleared as they're found.) */
export async function soreFor(userId: string, characterId: string): Promise<Sore | null> {
  const [r] = await sql()`select why, level, since::text, until::text, extract(epoch from until - now()) / 3600 as left
    from chat_sore where user_id = ${userId} and character_id = ${characterId}`;
  if (!r) return null;
  if (Number(r.left) <= 0) { await mend(userId, characterId); return null; }
  return { why: String(r.why), level: Number(r.level), since: String(r.since), until: String(r.until), hoursLeft: Math.max(0, Number(r.left)) };
}

/** Something landed badly. Level 1 is a niggle, 3 is properly hurt — never longer than 48 hours. */
export async function setSore(userId: string, characterId: string, why: string, level: number): Promise<number> {
  const lv = Math.max(1, Math.min(3, Math.round(level) || 1)) as 1 | 2 | 3;
  const hours = Math.min(MAX_HOURS, HOURS[lv]);
  await sql()`insert into chat_sore (user_id, character_id, why, level, since, until)
    values (${userId}, ${characterId}, ${scrub(why).slice(0, 300)}, ${lv}, now(), now() + ${`${hours} hours`}::interval)
    on conflict (user_id, character_id) do update set why = excluded.why, level = excluded.level, since = now(), until = excluded.until`;
  return hours;
}

/** It's mended — he noticed, or it simply passed. */
export const mend = (userId: string, characterId: string) =>
  sql()`delete from chat_sore where user_id = ${userId} and character_id = ${characterId}`;

