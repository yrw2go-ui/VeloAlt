import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { VELO_SYSTEM, CALL_TALK, CALL_RECAP, CALL_REMEMBER, CHAT_REMEMBER } from "../../lib/persona";
import { MEMORY_TOOLS, isMemoryTool, runMemoryTool, MemoryError, memoryBlock, saveConversationMemory } from "../../lib/memory";
import { REMINDER_TOOLS, isReminderTool, runReminderTool, ReminderError } from "../../lib/reminders";
import { isValidTimeZone, localDate, formatClock, weekdayOf } from "../../lib/localTime";

// 💬 Velo's brain. One route for everything she says:
//   mode "chat"     — a typed chat message
//   mode "talk"     — a turn on a 📞 voice call (short, spoken replies)
//   mode "recap"    — a written recap after a call
//   mode "remember" / "memo" — after a call / chat: save a summary, goals and facts to memory
// POST { mode, messages: [{role, content}], timeZone, name } → { reply, changed? }

// Only ever the app's own key (never another credential in the environment).
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
type Mode = "chat" | "talk" | "recap" | "remember" | "memo";
const MODES: Mode[] = ["chat", "talk", "recap", "remember", "memo"];
const TOOLS = [...MEMORY_TOOLS, ...REMINDER_TOOLS];

function localNow(rawTz: unknown) {
  const tz = isValidTimeZone(rawTz) ? rawTz : "America/Chicago";
  const now = Date.now();
  const date = localDate(now, tz);
  return { date, tz, label: `${weekdayOf(date)}, ${date}, ${formatClock(now, tz)} (time zone ${tz})` };
}

export async function POST(req: NextRequest) {
  try {
    const model = process.env.VELO_MODEL;
    if (!model || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Velo isn't set up yet (missing AI settings)." }, { status: 503 });
    const caller = await resolveCaller(req);
    if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!allow(caller.userId)) return NextResponse.json({ error: "That's a lot of messages — give it a minute and try again." }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const mode: Mode = MODES.includes(body.mode) ? body.mode : "chat";
    const raw = Array.isArray(body.messages) ? body.messages : [];
    if (!raw.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    const today = localNow(body.timeZone);
    const name = String(body.name || "").trim().split(/\s+/)[0].slice(0, 40);

    const memory = await memoryBlock(caller, today).catch(() => "");
    const modeText = mode === "talk" ? CALL_TALK : mode === "recap" ? CALL_RECAP : mode === "remember" ? CALL_REMEMBER : mode === "memo" ? CHAT_REMEMBER : "";
    const system: Anthropic.TextBlockParam[] = [
      // The persona never changes, so it's cached across everyone's chats.
      { type: "text", text: VELO_SYSTEM, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: [
          name ? `Their first name is ${name}.` : "You don't know their name yet — if it comes up naturally, ask, and remember it.",
          `Right now it is ${today.label} where they are.`,
          memory ? `${memory}\n\nYou two have talked before — never introduce yourself; talk like someone who knows them.` : "",
          modeText,
        ].filter(Boolean).join("\n\n"),
      },
    ];

    const messages: Anthropic.MessageParam[] = raw.slice(mode === "chat" ? -30 : -60).map((m: { role?: string; content?: unknown }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 4000) || "…",
    }));
    // A call opens with Velo's hello, so the turns can start on her side; the model wants the person first.
    if (messages[0]?.role === "assistant") messages.unshift({ role: "user", content: mode === "chat" ? "(Chat opened.)" : "(Call connected.)" });
    const wrapUp = mode === "recap" || mode === "remember" || mode === "memo";
    if (wrapUp) messages.push({ role: "user", content: mode === "recap" ? "(The call has ended. Write the call recap now, as described.)" : "(This conversation has ended. Reply with only the JSON object for your memory, as described.)" });

    // Up to 5 rounds: each tool_use round runs the tools and feeds results back.
    let reply = "";
    let changed = false;
    const tools = wrapUp ? undefined : TOOLS;
    for (let round = 0; round < (tools ? 5 : 1); round++) {
      const res = await client.messages.create({
        model,
        max_tokens: mode === "talk" ? 4000 : 8000,
        output_config: { effort: "low" },
        system,
        ...(tools ? { tools } : {}),
        cache_control: { type: "ephemeral" },
        messages,
      });
      if (res.stop_reason === "refusal") { reply = "I'd rather not go there — but I'm here for anything else. What's on your mind?"; break; }
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
            : (() => { throw new ReminderError(`Unknown tool ${c.name}`); })();
          if (isReminderTool(c.name) && !c.name.startsWith("list_")) changed = true;
          return { type: "tool_result" as const, tool_use_id: c.id, content: JSON.stringify(out).slice(0, 12000) };
        } catch (e) {
          const msg = e instanceof MemoryError || e instanceof ReminderError ? e.message : "That didn't save. Tell them it didn't go through and to try again — don't say it's done.";
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
      return NextResponse.json({ ok: saved, reply: "" });
    }
    return NextResponse.json({ reply: reply || "Sorry, I lost my train of thought — could you say that again?", ...(changed ? { changed: true } : {}) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Velo is busy right now — try again in a moment." }, { status: 429 });
    if (e instanceof Anthropic.APIError) { console.error("velo: api", e.status, e.message); return NextResponse.json({ error: "Velo is unavailable right now. Please try again." }, { status: 502 }); }
    console.error("velo", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
