// 🧠 Velo's brain, shared by every way of reaching her: the app chat, calls
// in the app, texting or calling her number, and calls she makes for you.
//   "chat"      — a typed chat message (app)
//   "sms"       — a text to her number from the owner
//   "talk"      — a turn on a voice call with the owner (app or phone)
//   "recap"     — a written recap after a call
//   "remember" / "memo" — after a call / chat: save a summary, goals and facts to memory
//   "errand"    — a turn on a call Velo is making FOR the owner to someone else
//   "errandsum" — a short report to the owner after that call
import Anthropic from "@anthropic-ai/sdk";
import type { Caller } from "./caller";
import { sql } from "./db";
import { VELO_SYSTEM, CALL_TALK, CALL_RECAP, CALL_REMEMBER, CHAT_REMEMBER, SMS_TALK, PRO_INFO, FREE_INFO, errandPrompt, ERRAND_SUMMARY } from "./persona";
import { MEMORY_TOOLS, isMemoryTool, runMemoryTool, MemoryError, memoryBlock, saveConversationMemory } from "./memory";
import { REMINDER_TOOLS, isReminderTool, runReminderTool, ReminderError } from "./reminders";
import { proToolsFor, isProTool, runProTool, ProError, type Draft } from "./pro";
import { twilioReady } from "./twilio";
import { isValidTimeZone, localDate, formatClock, weekdayOf } from "./localTime";

// Only ever the app's own key (never another credential in the environment).
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
export type Mode = "chat" | "sms" | "talk" | "recap" | "remember" | "memo" | "errand" | "errandsum";
export type Turn = { role: "user" | "assistant"; content: string };
export const aiReady = () => !!(process.env.VELO_MODEL && process.env.ANTHROPIC_API_KEY);

export function localNow(rawTz: unknown) {
  const tz = isValidTimeZone(rawTz) ? rawTz : "America/Chicago";
  const now = Date.now();
  const date = localDate(now, tz);
  return { date, tz, label: `${weekdayOf(date)}, ${date}, ${formatClock(now, tz)} (time zone ${tz})` };
}

export interface AskResult { reply: string; changed: boolean; drafts: Draft[]; saved?: boolean }

export async function askVelo(caller: Caller, opts: { mode: Mode; messages: Turn[]; timeZone?: unknown; name?: string; goal?: string; toName?: string }): Promise<AskResult> {
  const { mode } = opts;
  const today = localNow(opts.timeZone);
  const name = String(opts.name || "").trim().split(/\s+/)[0].slice(0, 40);
  const [u] = await sql()`select plan from users where id = ${caller.userId}`;
  const pro = u?.plan === "pro" && twilioReady();
  const proTools = pro ? await proToolsFor(caller.userId) : null;
  const drafts: Draft[] = [];

  // On a call Velo makes for them, the other person never hears their private memory.
  const errand = mode === "errand" || mode === "errandsum";
  const memory = errand ? "" : await memoryBlock(caller, today).catch(() => "");
  const modeText = {
    chat: "", sms: SMS_TALK, talk: CALL_TALK, recap: CALL_RECAP, remember: CALL_REMEMBER, memo: CHAT_REMEMBER,
    errand: errandPrompt(name, opts.toName || "", opts.goal || ""), errandsum: ERRAND_SUMMARY,
  }[mode];
  const system: Anthropic.TextBlockParam[] = [
    // The persona never changes, so it's cached across everyone's chats.
    { type: "text", text: VELO_SYSTEM, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: [
        errand ? "" : name ? `Their first name is ${name}.` : "You don't know their name yet — if it comes up naturally, ask, and remember it.",
        `Right now it is ${today.label}${errand ? "" : " where they are"}.`,
        errand ? "" : pro ? PRO_INFO + (proTools?.page ? `\nTheir Facebook Page "${proTools.page}" is connected: you can draft posts for it (draft_post).` : "\nNo Facebook Page is connected; if they want you to post, tell them to connect one in Settings → Velo Pro (Facebook only allows Pages, not personal profiles).") : FREE_INFO,
        memory ? `${memory}\n\nYou two have talked before — never introduce yourself; talk like someone who knows them.` : "",
        modeText,
      ].filter(Boolean).join("\n\n"),
    },
  ];

  const messages: Anthropic.MessageParam[] = opts.messages.slice(mode === "chat" || mode === "sms" ? -30 : -60).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000) || "…",
  }));
  // A call opens with Velo's hello, so the turns can start on her side; the model wants the other person first.
  if (messages[0]?.role === "assistant") messages.unshift({ role: "user", content: mode === "chat" ? "(Chat opened.)" : "(Call connected.)" });
  if (!messages.length) messages.push({ role: "user", content: "(Call connected. Say your opening line now.)" });
  const wrapUp = mode === "recap" || mode === "remember" || mode === "memo" || mode === "errandsum";
  if (wrapUp) messages.push({ role: "user", content: mode === "recap" ? "(The call has ended. Write the call recap now, as described.)" : mode === "errandsum" ? "(The call has ended. Write the report now, as described.)" : "(This conversation has ended. Reply with only the JSON object for your memory, as described.)" });

  // Tools: none on wrap-ups or errands; Pro adds contacts and drafts.
  const tools = wrapUp || errand ? undefined : [...MEMORY_TOOLS, ...REMINDER_TOOLS, ...(proTools?.tools || [])];
  let reply = "";
  let changed = false;
  for (let round = 0; round < (tools ? 5 : 1); round++) {
    const res = await client.messages.create({
      model: process.env.VELO_MODEL!,
      max_tokens: mode === "talk" || mode === "errand" || mode === "sms" ? 4000 : 8000,
      output_config: { effort: "low" },
      system,
      ...(tools ? { tools } : {}),
      cache_control: { type: "ephemeral" },
      messages,
    });
    if (res.stop_reason === "refusal") { reply = errand ? "I'm sorry, I can't help with that. Thanks for your time, goodbye. [[END]]" : "I'd rather not go there — but I'm here for anything else. What's on your mind?"; break; }
    reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("\n").trim();
    if (res.stop_reason !== "tool_use") break;
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!calls.length) break;
    // Pass the whole response back (thinking blocks included).
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(calls.map(async c => {
      try {
        const out = isMemoryTool(c.name) ? await runMemoryTool(caller, c.name, c.input)
          : isReminderTool(c.name) ? await runReminderTool(caller, c.name, c.input, today.tz)
          : isProTool(c.name) && pro ? await runProTool(caller, c.name, c.input, drafts)
          : (() => { throw new ReminderError(isProTool(c.name) ? "That's a Velo Pro feature." : `Unknown tool ${c.name}`); })();
        if (isReminderTool(c.name) && !c.name.startsWith("list_")) changed = true;
        return { type: "tool_result" as const, tool_use_id: c.id, content: JSON.stringify(out).slice(0, 12000) };
      } catch (e) {
        const msg = e instanceof MemoryError || e instanceof ReminderError || e instanceof ProError ? e.message : "That didn't save. Tell them it didn't go through and to try again — don't say it's done.";
        return { type: "tool_result" as const, tool_use_id: c.id, is_error: true, content: msg };
      }
    }));
    messages.push({ role: "user", content: results });
    if (round === 4) reply = "";
  }

  if (mode === "remember" || mode === "memo") {
    let saved = false;
    try {
      const j = JSON.parse((reply.match(/\{[\s\S]*\}/) || ["{}"])[0]) as { summary?: unknown; goals?: unknown; facts?: unknown };
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      if (typeof j.summary === "string") { await saveConversationMemory(caller, mode === "memo" ? "chat" : "call", j.summary, list(j.goals), list(j.facts)); saved = true; }
    } catch (e) { console.error("velo: memory", e); }
    return { reply: "", changed: false, drafts, saved };
  }
  return { reply: reply || (errand ? "Sorry, could you say that again?" : "Sorry, I lost my train of thought — could you say that again?"), changed, drafts };
}

/** Logs an Anthropic failure and turns it into a friendly message. */
export function aiError(e: unknown): { error: string; status: number } {
  if (e instanceof Anthropic.RateLimitError) return { error: "Velo is busy right now — try again in a moment.", status: 429 };
  if (e instanceof Anthropic.APIError) { console.error("velo: api", e.status, e.message); return { error: "Velo is unavailable right now. Please try again.", status: 502 }; }
  console.error("velo", e);
  return { error: "Something went wrong. Please try again.", status: 500 };
}
