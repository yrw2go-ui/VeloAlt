// ✍️ One-shot writing (peek descriptions, "how they met" stories): by the character's own brain
// (Qwen / DeepSeek through Atlas Cloud) when she has one, else Claude. If her brain fails, Claude
// writes it instead, so it still works.
import Anthropic from "@anthropic-ai/sdk";
import { atlasChain } from "./models";
import { oaChat } from "./openai";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });

/** How long one short bit of writing may take before we stop waiting and use the plain words instead.
 *  Anything a person is sitting and watching for (her "not tonight", talking her round) passes a
 *  budget: a brain that's being slow mustn't hold up the whole request, let alone time it out. */
export type Budget = { ms: number };

export async function writeText(brain: unknown, system: string, user: string, maxTokens: number, budget?: Budget): Promise<string> {
  const until = budget ? Date.now() + budget.ms : 0;
  const left = () => (until ? until - Date.now() : 60_000);
  // Her brain(s) in order (the chain: Qwen fast, then Qwen big), then Claude.
  for (const p of atlasChain(brain)) {
    if (until && left() < 2_000) { console.error("llm: out of time for the brains, going to Claude"); break; }
    try {
      const r = await oaChat(p, [{ role: "system", content: system }, { role: "user", content: user }], [], maxTokens, undefined, Math.min(60_000, left()));
      if (r.content) return r.content;
      console.error(`llm: [${p.model}] answered with nothing, trying the next`);
    } catch (e) { console.error("llm: character brain failed, trying the next:", e instanceof Error ? e.message : e); }
  }
  if (until && left() < 2_000) { console.error("llm: out of time — the plain words will do"); return ""; }
  const res = await client.messages.create({ model: process.env.VELO_MODEL!, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
    until ? { timeout: left() } : undefined);
  const text = res.content.map(b => (b.type === "text" ? b.text : "")).join(" ");
  if (!text.trim()) console.error(`llm: Claude answered with nothing (${res.stop_reason})`);
  return text;
}
