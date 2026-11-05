// ⏰ "Text me at 8": a character can promise to text them at a set time — if she would, given her
// personality and how things are between them (she can tease, bargain or say no). When the time
// comes, the message lands in her chat and as a push notification.
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { formatLocal, zonedToUtc } from "./localTime";

const MAX_PENDING = 5;
const MONTH_MS = 31 * 86400_000;

export const PROMISE_TOOL: Anthropic.Tool = {
  name: "text_them_later",
  description: "Promise to text them at a specific time — when they ask you to (\"text me at 8\", \"wake me up at 7\", \"message me after my meeting at 3\") or you offer. Only if YOU would, given your personality, your mood and how things are between you: you can happily agree, agree with a tease, bargain, forget-proof it, or say no in character. Once you agree, the text really arrives on their phone at that time. Give the time as THEIR local wall-clock time.",
  input_schema: {
    type: "object",
    properties: {
      local_datetime: { type: "string", description: "Their local date and time, YYYY-MM-DDTHH:MM (24-hour)" },
      about: { type: "string", description: "What the text is for, e.g. \"wake-up text\", \"remind them about the interview\", \"say goodnight\"" },
    },
    required: ["local_datetime", "about"],
    additionalProperties: false,
  },
};

export async function runPromiseTool(userId: string, characterId: string, input: unknown, timeZone: string): Promise<Record<string, unknown>> {
  const i = (input && typeof input === "object" ? input : {}) as { local_datetime?: unknown; about?: unknown };
  const about = String(i.about || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!about) return { error: "Say what the text is for." };
  const at = zonedToUtc(String(i.local_datetime || "").trim(), timeZone);
  if (at === null) return { error: "local_datetime must be a real date and time as YYYY-MM-DDTHH:MM." };
  if (at <= Date.now() + 30_000) return { error: `That time (${formatLocal(at, timeZone)}) has already passed. Ask for a later time.` };
  if (at - Date.now() > MONTH_MS) return { error: "You can promise texts up to a month ahead." };
  const [{ n }] = await sql()`select count(*)::int as n from chat_promises where user_id = ${userId} and character_id = ${characterId} and status = 'pending'`;
  if (n >= MAX_PENDING) return { error: `You already promised ${MAX_PENDING} texts — that's plenty for now.` };
  await sql()`insert into chat_promises (user_id, character_id, due_at, about) values (${userId}, ${characterId}, ${new Date(at).toISOString()}, ${about})`;
  return { ok: true, local_time: formatLocal(at, timeZone), tell_them: "Promised — it will really arrive then. Confirm it in your own words (don't mention apps or notifications)." };
}

/** Texts she promised and hasn't sent yet, for the prompt. */
export async function promisesNote(userId: string, characterId: string, timeZone: string): Promise<string> {
  const rows = await sql()`select due_at, about from chat_promises where user_id = ${userId} and character_id = ${characterId} and status = 'pending' order by due_at limit 5`;
  if (!rows.length) return "";
  return "TEXTS YOU PROMISED TO SEND THEM (they'll go out on their own at that time): " + rows.map(r => `${formatLocal(new Date(r.due_at as string).getTime(), timeZone)} — ${r.about}`).join("; ") + ".";
}

