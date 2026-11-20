// 🗑 Deleting messages: they're gone from the chat, and whatever she remembered only because of them is
// forgotten too (memories saved since then are checked: dropped, or rewritten without those bits).
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";

export async function deleteMessages(userId: string, characterId: string | null, ids: string[], brain: unknown, personName: string, herName: string): Promise<{ deleted: number; forgot: number }> {
  const want = [...new Set(ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 10);
  if (!want.length) return { deleted: 0, forgot: 0 };
  const rows = await sql()`delete from velo_messages where user_id = ${userId} and character_id is not distinct from ${characterId} and id = any(${want}::uuid[])
    returning role, content, created_at::text`;
  if (!rows.length) return { deleted: 0, forgot: 0 };
  const since = rows.map(r => String(r.created_at)).sort()[0];
  const lines = rows.map(r => `${r.role === "assistant" ? herName : personName || "Them"}: ${String(r.content).slice(0, 600)}`).join("\n");
  return { deleted: rows.length, forgot: await forgetLines(userId, characterId, lines, since, brain) };
}

/** Her memories saved since `since`: drop or rewrite whatever came only from these (deleted) lines. */
export async function forgetLines(userId: string, characterId: string | null, lines: string, since: string, brain: unknown): Promise<number> {
  const mems = await sql()`select id, text from velo_memories where user_id = ${userId} and character_id is not distinct from ${characterId} and status = 'active'
    and created_at >= ${since}::timestamptz - interval '1 minute' order by created_at limit 40`;
  return forget(userId, mems as unknown as Mem[], lines, brain,
    id => sql()`delete from velo_memories where id = ${id} and user_id = ${userId}`,
    (id, text) => sql()`update velo_memories set text = ${text}, updated_at = now() where id = ${id} and user_id = ${userId}`);
}

/**
 * 📸 The same, for what a Picagram woman remembers from your DMs: delete a message there and
 * whatever she only knew because of it goes with it.
 */
export async function forgetPicaLines(userId: string, accountId: string, lines: string, since: string, brain: unknown): Promise<number> {
  const mems = await sql()`select id, text from pica_memories where user_id = ${userId} and account_id = ${accountId}
    and created_at >= ${since}::timestamptz - interval '1 minute' order by created_at limit 40`;
  return forget(userId, mems as unknown as Mem[], lines, brain,
    id => sql()`delete from pica_memories where id = ${id} and user_id = ${userId}`,
    (id, text) => sql()`update pica_memories set text = ${text} where id = ${id} and user_id = ${userId}`);
}

const ASK = `Some chat messages were deleted: it's as if they were never said. Below are memories saved since then. For each memory that contains anything that came ONLY from the deleted messages, either remove it (if that's all it is about) or rewrite it without those parts (keep everything else exactly). Leave memories that don't use the deleted messages alone. Reply with JSON only: {"remove":[numbers],"rewrite":{"number":"new text"}}.`;

type Mem = { id: string; text: string };

const REWORD_ASK = `A chat message was reworded. The OLD wording below was never said — only the NEW wording was. Below are memories saved since then. For each memory that rests on the old wording, either remove it (if that's all it is about) or rewrite it so it matches the new wording (keep everything else exactly, and keep any date it starts with). Leave memories that don't rest on the old wording alone. Reply with JSON only: {"remove":[numbers],"rewrite":{"number":"new text"}}.`;

/**
 * ✏️ A message was reworded, so what she took from the old wording is wrong. Memories saved since
 * it was sent get checked: dropped, or rewritten to match what the message says now.
 *
 * Her reply is left alone — she said what she said. This only fixes what she wrote down.
 */
export async function rewordedLine(userId: string, characterId: string | null, who: string, before: string, after: string, since: string, brain: unknown): Promise<number> {
  const lines = said(who, before, after);
  if (!lines) return 0;
  const mems = await sql()`select id, text from velo_memories where user_id = ${userId} and character_id is not distinct from ${characterId} and status = 'active'
    and created_at >= ${since}::timestamptz - interval '1 minute' order by created_at limit 40`;
  return forget(userId, mems as unknown as Mem[], lines, brain,
    id => sql()`delete from velo_memories where id = ${id} and user_id = ${userId}`,
    (id, text) => sql()`update velo_memories set text = ${text}, updated_at = now() where id = ${id} and user_id = ${userId}`, REWORD_ASK);
}

/** Nothing to do when the wording didn't really change. */
function said(who: string, before: string, after: string): string {
  const a = String(before || "").trim(), b = String(after || "").trim();
  if (!a || !b || a === b) return "";
  return `OLD (never said) — ${who}: ${a.slice(0, 600)}\nNEW (what was said) — ${who}: ${b.slice(0, 600)}`;
}



/** Ask her which of these memories only existed because of the deleted lines, then do it. */
async function forget(userId: string, mems: Mem[], lines: string, brain: unknown,
  drop: (id: string) => Promise<unknown>, rewrite: (id: string, text: string) => Promise<unknown>, ask = ASK): Promise<number> {
  if (!mems.length) return 0;
  const list = mems.map((m, i) => `${i + 1}. ${m.text}`).join("\n");
  const raw = await writeText(brain, ask, `DELETED MESSAGES:\n${lines}\n\nMEMORIES:\n${list}`, 1200).catch(() => "");
  let plan: { remove?: unknown; rewrite?: unknown } = {};
  try { plan = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { /* not JSON: forget nothing */ }
  let forgot = 0;
  const pick = (n: unknown) => mems[Number(n) - 1];
  for (const n of Array.isArray(plan.remove) ? plan.remove : []) {
    const m = pick(n); if (!m) continue;
    await drop(m.id); forgot++;
  }
  if (plan.rewrite && typeof plan.rewrite === "object") for (const [n, t] of Object.entries(plan.rewrite as Record<string, unknown>)) {
    const m = pick(n), text = scrub(String(t || "")).replace(/\s+/g, " ").trim().slice(0, 600);
    if (!m || (Array.isArray(plan.remove) && plan.remove.map(Number).includes(Number(n)))) continue;
    if (text.length < 3) { await drop(m.id); forgot++; continue; }
    if (text !== m.text) { await rewrite(m.id, text); forgot++; }
  }
  return forgot;
}
