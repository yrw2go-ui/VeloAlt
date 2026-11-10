// ✍️ One-shot writing (peek descriptions, "how they met" stories): by the character's own brain
// (Qwen / DeepSeek through Atlas Cloud) when she has one, else Claude. If her brain fails, Claude
// writes it instead, so it still works.
import Anthropic from "@anthropic-ai/sdk";
import { atlasChain } from "./models";
import { oaChat } from "./openai";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });

export async function writeText(brain: unknown, system: string, user: string, maxTokens: number): Promise<string> {
  // Her brain(s) in order (the chain: Qwen fast, then Qwen big), then Claude.
  for (const p of atlasChain(brain)) {
    try {
      const r = await oaChat(p, [{ role: "system", content: system }, { role: "user", content: user }], [], maxTokens);
      if (r.content) return r.content;
      console.error(`llm: [${p.model}] answered with nothing, trying the next`);
    } catch (e) { console.error("llm: character brain failed, trying the next:", e instanceof Error ? e.message : e); }
  }
  const res = await client.messages.create({ model: process.env.VELO_MODEL!, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const text = res.content.map(b => (b.type === "text" ? b.text : "")).join(" ");
  if (!text.trim()) console.error(`llm: Claude answered with nothing (${res.stop_reason})`);
  return text;
}
