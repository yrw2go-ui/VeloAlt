// The OpenAI-compatible chat API (Qwen, DeepSeek, and Atlas brains): one request
// at a time, with tool calls. Velo's tools are written for Claude (name,
// description, input_schema) and are converted here.
// Endpoints, keys and the request body stay as on main. A forced tool choice
// that Atlas rejects is asked again with just that tool, and a tools request
// the provider refuses is tried once without tools.
import type Anthropic from "@anthropic-ai/sdk";
import type { OpenAiProvider } from "./models";

export type OaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OaToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type OaToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export const toOaTools = (tools: Anthropic.Tool[]) =>
  tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description || "", parameters: t.input_schema } }));

import { noteUse } from "./usage";

export class ProviderError extends Error {}

export async function oaChat(p: OpenAiProvider, messages: OaMessage[], tools: ReturnType<typeof toOaTools>, maxTokens: number, mustUse?: string, timeoutMs = 60_000, source = "other"): Promise<{ content: string; toolCalls: OaToolCall[] }> {
  // Some models (Qwen on Atlas) refuse a forced tool choice ("invalid request params"): then ask nicely instead —
  // just that one tool on offer, and "auto". If tools are refused outright, try once with none.
  if (mustUse && tools.length) {
    try { return await oaChatOnce(p, messages, tools, maxTokens, mustUse, timeoutMs, source); }
    catch (e) {
      if (!(e instanceof ProviderError) || !/^400\b/.test(e.message)) throw e;
      try { return await oaChatOnce(p, messages, tools.filter(t => t.function.name === mustUse), maxTokens, undefined, timeoutMs, source); }
      catch (e2) {
        if (!(e2 instanceof ProviderError)) throw e2;
        return oaChatOnce(p, messages, [], maxTokens, undefined, timeoutMs, source);
      }
    }
  }
  try { return await oaChatOnce(p, messages, tools, maxTokens, mustUse, timeoutMs, source); }
  catch (e) {
    if (tools.length && e instanceof ProviderError) return oaChatOnce(p, messages, [], maxTokens, undefined, timeoutMs, source);
    throw e;
  }
}

async function oaChatOnce(p: OpenAiProvider, messages: OaMessage[], tools: ReturnType<typeof toOaTools>, maxTokens: number, mustUse?: string, timeoutMs = 60_000, source = "other"): Promise<{ content: string; toolCalls: OaToolCall[] }> {
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: p.model, messages, max_tokens: p.minTokens ? Math.max(maxTokens, p.minTokens) : maxTokens, ...(tools.length ? { tools, tool_choice: mustUse ? { type: "function", function: { name: mustUse } } : "auto" } : {}), ...(p.extra || {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  let data: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = JSON.parse(body); } catch { /* not JSON */ }
  if (!res.ok) throw new ProviderError(`${res.status} [${p.model}] ${String(data?.error?.message || data?.message || data?.msg || data?.detail || body).replace(/\s+/g, " ").slice(0, 300)}`);
  noteUse(source, p.model, Number(data?.usage?.prompt_tokens) || 0, Number(data?.usage?.completion_tokens) || 0);
  const msg = data?.choices?.[0]?.message || {};
  const toolCalls: OaToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c: OaToolCall) => c?.id && c.function?.name) : [];
  const content = String(msg.content || "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
  return { content, toolCalls };
}
