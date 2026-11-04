// 🧠 Velo's long-term memory: goals (and when they're hit), facts about their
// life, and a short summary of every chat and call. Velo reads them on every
// chat and call so she can follow up like someone who knows them.
// Every query is scoped to the caller's user_id AND the thread: Velo's memories
// (character_id null) or one character's, so nothing crosses between them. People can see and forget everything
// on the 🧠 Memory tab.
import type Anthropic from "@anthropic-ai/sdk";
import type { Caller } from "./caller";
import { localDate } from "./localTime";
import { sql } from "./db";
import { scrub } from "./secrets";

export const MEMORY_TOOL_NAMES = ["remember", "update_goal", "forget_memory"] as const;
export const isMemoryTool = (name: string) => (MEMORY_TOOL_NAMES as readonly string[]).includes(name);
export class MemoryError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTIVE = 300;
const clean = (v: unknown, n: number) => scrub(String(v || "").replace(/\s+/g, " ").trim().slice(0, n));

export const MEMORY_TOOLS: Anthropic.Tool[] = [
  {
    name: "remember",
    description: "Save something to your long-term memory of this person so you know it next time: a GOAL they set (\"run a half marathon in May\", \"save $5k by summer\") or a FACT worth knowing later (people in their life and who they are, health, work, likes and dislikes, plans like \"getting a dog in about 6 months\", big news like a new baby or a loss). Use it when they state a goal, ask you to remember something, or share something that will clearly matter later. Skip passing small talk (weather, \"busy day\"). Write it short, in their words, with a date or number when they gave one.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["goal", "fact"] },
        text: { type: "string", description: "One short sentence (max ~200 characters)" },
      },
      required: ["kind", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "update_goal",
    description: "Mark one of their goals (from YOUR MEMORY, by memory_id) as hit, dropped, or active again. Mark it hit when they tell you they did it (then celebrate with them).",
    input_schema: {
      type: "object",
      properties: { memory_id: { type: "string" }, status: { type: "string", enum: ["hit", "dropped", "active"] } },
      required: ["memory_id", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "forget_memory",
    description: "Forget one memory (by memory_id from YOUR MEMORY) when they ask you to forget it or it's no longer true.",
    input_schema: { type: "object", properties: { memory_id: { type: "string" } }, required: ["memory_id"], additionalProperties: false },
  },
];

export async function runMemoryTool(c: Caller, name: string, input: unknown, cid: string | null = null): Promise<unknown> {
  const a = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const db = sql();
  if (name === "remember") {
    const kind = a.kind === "goal" ? "goal" : "fact";
    const text = clean(a.text, 300);
    if (text.length < 3) throw new MemoryError("Say what to remember in a few words.");
    const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind in ('goal', 'fact')`;
    if (n >= MAX_ACTIVE) throw new MemoryError("Memory is full. Ask them to clear some old memories on the 🧠 Memory tab.");
    const [row] = await db`insert into velo_memories (user_id, character_id, kind, text) values (${c.userId}, ${cid}, ${kind}, ${text}) returning id`;
    return { ok: true, memory_id: row.id, tell_them: kind === "goal" ? "Say briefly that you'll keep that goal in mind and check in on it." : "Say briefly that you'll remember that (or just carry on naturally)." };
  }
  const id = String(a.memory_id || "");
  if (!UUID.test(id)) throw new MemoryError("That memory isn't in the list.");
  if (name === "update_goal") {
    const status = a.status === "hit" || a.status === "dropped" ? a.status : "active";
    const rows = await db`update velo_memories set status = ${status}, updated_at = now(), hit_at = ${status === "hit" ? new Date().toISOString() : null}
      where id = ${id} and user_id = ${c.userId} and character_id is not distinct from ${cid} and kind = 'goal' returning text`;
    if (!rows.length) throw new MemoryError("That goal isn't in the list.");
    return { ok: true, goal: rows[0].text, status };
  }
  if (name === "forget_memory") {
    const rows = await db`delete from velo_memories where id = ${id} and user_id = ${c.userId} and character_id is not distinct from ${cid} returning id`;
    if (!rows.length) throw new MemoryError("That memory isn't in the list.");
    return { ok: true, tell_them: "Say it's forgotten." };
  }
  throw new MemoryError("Unknown memory action.");
}

const day = (ts: string) => ts.slice(0, 10);
// Postgres text timestamps look like "2026-11-04 22:01:02.12+00"; "+00" needs to be "+00:00" to parse.
const ms = (ts: string) => Date.parse(ts.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));

/** What Velo remembers about this person, for the system prompt (empty when nothing yet). */
export async function memoryBlock(c: Caller, today: { date: string; tz: string | null }, cid: string | null = null): Promise<string> {
  const db = sql();
  const [goals, facts, talks] = await Promise.all([
    db`select id, text, status, created_at::text, hit_at::text from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind = 'goal' order by created_at desc limit 30`,
    db`select id, text, created_at::text from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind = 'fact' order by created_at desc limit 60`,
    db`select id, kind, text, created_at::text from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind in ('call', 'chat') order by created_at desc limit 8`,
  ]);
  const g = goals as unknown as { id: string; text: string; status: string; created_at: string; hit_at: string | null }[];
  const active = g.filter(x => x.status === "active"), hit = g.filter(x => x.status === "hit").slice(0, 8);
  const lines: string[] = [];
  if (active.length) lines.push("Goals they're working on:\n" + active.map(x => `  • ${x.text} (set ${day(x.created_at)}) [memory_id: ${x.id}]`).join("\n"));
  if (hit.length) lines.push("Goals they've hit 🎉:\n" + hit.map(x => `  • ${x.text} (hit ${day(x.hit_at || x.created_at)}) [memory_id: ${x.id}]`).join("\n"));
  if (facts.length) lines.push("Things you know about them:\n" + (facts as unknown as { id: string; text: string; created_at: string }[]).map(x => `  • ${x.text} (said ${day(x.created_at)}) [memory_id: ${x.id}]`).join("\n"));
  if (talks.length) lines.push("Your recent chats and calls (newest first):\n" + (talks as unknown as { id: string; kind: string; text: string; created_at: string }[]).map(x => `  • ${day(x.created_at)} ${x.kind}: ${x.text}`).join("\n"));
  if (!lines.length) return "";
  const talkedToday = (talks as unknown as { created_at: string }[])
    .some(x => (today.tz ? localDate(ms(x.created_at), today.tz) : day(x.created_at)) === today.date);
  const followUps = talkedToday
    ? "You already talked earlier today, so DON'T bring up goals or plans unless they do"
    : "You may follow up on ONE goal, plan or bit of life news, once, if it fits naturally (drop it if they move on)";
  return `YOUR MEMORY of this person (from earlier chats and calls — use it naturally, never recite it or show memory_ids. ${followUps}). Keep it current: save new goals and key things with remember; if they ask you to forget something, call forget_memory on every memory that holds it:\n${lines.join("\n")}`;
}

/** After a call or chat: keep a short summary, plus new goals and facts that aren't saved yet. */
export async function saveConversationMemory(c: Caller, kind: "call" | "chat", summary: string, goals: string[], facts: string[], cid: string | null = null) {
  const db = sql();
  const text = clean(summary, 500);
  if (text.length >= 10) await db`insert into velo_memories (user_id, character_id, kind, text) values (${c.userId}, ${cid}, ${kind}, ${text})`;
  const have = await db`select text from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind in ('goal', 'fact') limit ${MAX_ACTIVE}`;
  const known = new Set(have.map(h => String(h.text).toLowerCase()));
  let room = MAX_ACTIVE - have.length;
  for (const [k, list] of [["goal", goals], ["fact", facts]] as const) {
    for (const t of list.slice(0, 5).map(x => clean(x, 300)).filter(x => x.length >= 3)) {
      if (room <= 0 || known.has(t.toLowerCase())) continue;
      await db`insert into velo_memories (user_id, character_id, kind, text) values (${c.userId}, ${cid}, ${k}, ${t})`;
      known.add(t.toLowerCase()); room--;
    }
  }
  // Keep the last 60 summaries of each kind.
  await db`delete from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind = ${kind} and id not in
    (select id from velo_memories where user_id = ${c.userId} and character_id is not distinct from ${cid} and kind = ${kind} order by created_at desc limit 60)`;
}
