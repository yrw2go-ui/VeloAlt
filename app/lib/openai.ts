// The OpenAI-compatible chat API (Qwen, DeepSeek): one request at a time, with
// tool calls. Velo's tools are written for Claude (name, description,
// input_schema) and are converted here.
import type Anthropic from "@anthropic-ai/sdk";
import type { OpenAiProvider } from "./models";

export type OaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OaToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type OaToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export const toOaTools = (tools: Anthropic.Tool[]) =>
  tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description || "", parameters: t.input_schema } }));

export class ProviderError extends Error {}

export async function oaChat(p: OpenAiProvider, messages: OaMessage[], tools: ReturnType<typeof toOaTools>, maxTokens: number, mustUse?: string): Promise<{ content: string; toolCalls: OaToolCall[] }> {
  const reqBody = JSON.stringify({ model: p.model, messages, max_tokens: p.minTokens ? Math.max(maxTokens, p.minTokens) : maxTokens, ...(tools.length ? { tools, tool_choice: mustUse ? { type: "function", function: { name: mustUse } } : "auto" } : {}), ...(p.extra || {}) });
  let res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: reqBody,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok && tools.length) {
    const noToolsBody = JSON.stringify({ model: p.model, messages, max_tokens: p.minTokens ? Math.max(maxTokens, p.minTokens) : maxTokens, ...(p.extra || {}) });
    res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
      body: noToolsBody,
      signal: AbortSignal.timeout(60_000),
    });
  }
  const body = await res.text();
  let data: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = JSON.parse(body); } catch { /* not JSON */ }
  // The whole reason (the model, and what the service said), so a failure can be traced.
  if (!res.ok) throw new ProviderError(`${res.status} [${p.model}] ${String(data?.error?.message || data?.message || data?.msg || data?.detail || body).replace(/\s+/g, " ").slice(0, 300)}`);
  const msg = data?.choices?.[0]?.message || {};
  const toolCalls: OaToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c: OaToolCall) => c?.id && c.function?.name) : [];
  // Reasoning models may put their thinking in <think>…</think>: only the answer is kept.
  const content = String(msg.content || "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
  return { content, toolCalls };
}
