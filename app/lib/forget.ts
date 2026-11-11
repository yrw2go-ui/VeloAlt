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
  const mems = await sql()`select id, text from velo_memories where user_id = ${userId} and character_id is not distinct from ${characterId} and status = 'active'
    and created_at >= ${since}::timestamptz - interval '1 minute' order by created_at limit 40`;
  if (!mems.length) return { deleted: rows.length, forgot: 0 };
  const lines = rows.map(r => `${r.role === "assistant" ? herName : personName || "Them"}: ${String(r.content).slice(0, 600)}`).join("\n");
  const list = mems.map((m, i) => `${i + 1}. ${m.text}`).join("\n");
  const raw = await writeText(brain, `Some chat messages were deleted: it's as if they were never said. Below are memories saved since then. For each memory that contains anything that came ONLY from the deleted messages, either remove it (if that's all it is about) or rewrite it without those parts (keep everything else exactly). Leave memories that don't use the deleted messages alone. Reply with JSON only: {"remove":[numbers],"rewrite":{"number":"new text"}}.`,
    `DELETED MESSAGES:\n${lines}\n\nMEMORIES:\n${list}`, 1200).catch(() => "");
  let plan: { remove?: unknown; rewrite?: unknown } = {};
  try { plan = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { /* not JSON: forget nothing */ }
  let forgot = 0;
  const pick = (n: unknown) => mems[Number(n) - 1];
  for (const n of Array.isArray(plan.remove) ? plan.remove : []) {
    const m = pick(n); if (!m) continue;
    await sql()`delete from velo_memories where id = ${m.id} and user_id = ${userId}`; forgot++;
  }
  if (plan.rewrite && typeof plan.rewrite === "object") for (const [n, t] of Object.entries(plan.rewrite as Record<string, unknown>)) {
    const m = pick(n), text = scrub(String(t || "")).replace(/\s+/g, " ").trim().slice(0, 600);
    if (!m || (Array.isArray(plan.remove) && plan.remove.map(Number).includes(Number(n)))) continue;
    if (text.length < 3) { await sql()`delete from velo_memories where id = ${m.id} and user_id = ${userId}`; forgot++; continue; }
    if (text !== m.text) { await sql()`update velo_memories set text = ${text}, updated_at = now() where id = ${m.id} and user_id = ${userId}`; forgot++; }
  }
  return { deleted: rows.length, forgot };
}
