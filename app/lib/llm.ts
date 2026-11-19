// ✍️ One-shot writing (peek descriptions, "how they met" stories): by the brain picked in
// Settings. Only that one — if Claude is picked it's Claude, and if Qwen is picked Claude is
// never quietly asked instead. A backup brain, when one is switched on, is tried after it.
import Anthropic from "@anthropic-ai/sdk";
import { brainProvider } from "./models";
import { oaChat } from "./openai";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });

/** How long one short bit of writing may take before we stop waiting and use the plain words instead.
 *  Anything a person is sitting and watching for (her "not tonight", talking her round) passes a
 *  budget: a brain that's being slow mustn't hold up the whole request, let alone time it out. */
export type Budget = { ms: number };

/** The brains to try, in order. A list from brainFor(); a bare "" or "claude" means Claude alone. */
const asOrder = (spec: unknown): string[] =>
  Array.isArray(spec) ? spec.map(String).filter(Boolean) : [String(spec || "") || "claude"];

export async function writeText(spec: unknown, system: string, user: string, maxTokens: number, budget?: Budget): Promise<string> {
  const until = budget ? Date.now() + budget.ms : 0;
  const left = () => (until ? until - Date.now() : 60_000);
  const order = asOrder(spec);
  let last: unknown = null;
  for (const id of order) {
    if (until && left() < 2_000) { console.error("llm: out of time — the plain words will do"); break; }
    const p = brainProvider(id);
    // 🅰️ Claude, when that's what they picked (or their backup).
    if (!p) {
      try {
        const text = await viaClaude(system, user, maxTokens, until ? left : null);
        if (text.trim()) return text;
      } catch (e) { last = e; console.error("llm: Claude failed", e instanceof Error ? e.message : e); }
      continue;
    }
    try {
      const r = await oaChat(p, [{ role: "system", content: system }, { role: "user", content: user }], [], maxTokens, undefined, Math.min(60_000, left()));
      if (r.content) return r.content;
      console.error(`llm: [${p.model}] answered with nothing`);
    } catch (e) { last = e; console.error(`llm: [${p.model}] failed`, e instanceof Error ? e.message : e); }
  }
  // 🚫 No stand-in: the brain they picked couldn't do it, so the plain words are used instead.
  if (last) console.error(`llm: none of [${order.join(", ")}] could write it`);
  return "";
}

async function viaClaude(system: string, user: string, maxTokens: number, left: null | (() => number)): Promise<string> {
  const ask = (tokens: number) => client.messages.create({ model: process.env.VELO_MODEL!, max_tokens: tokens, system, messages: [{ role: "user", content: user }] },
    left ? { timeout: left() } : undefined);
  const words = (r: Awaited<ReturnType<typeof ask>>) => r.content.map(b => (b.type === "text" ? b.text : "")).join(" ");
  const res = await ask(maxTokens);
  const text = words(res);
  if (text.trim()) return text;
  // 🪫 Nothing came back because it ran out of room to answer in (it can spend the budget
  // thinking). One more go with twice the room, rather than handing back an empty string.
  if (res.stop_reason === "max_tokens" && (!left || left() > 5_000)) {
    console.error(`llm: Claude ran out of room (${maxTokens} tokens) — trying again with ${maxTokens * 2}`);
    const more = words(await ask(maxTokens * 2));
    if (more.trim()) return more;
  }
  console.error(`llm: Claude answered with nothing (${res.stop_reason})`);
  return text;
}
