// The OpenAI-compatible chat API (Qwen, DeepSeek): one request at a time, with
// tool calls. Velo's tools are written for Claude (name, description,
// input_schema) and are converted here.
// Some models (especially DeepSeek) sometimes emit tool calls as XML text
// (<invoke name="...">) instead of the proper tool_calls field. We parse those.
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

/** Pull <invoke name="tool">...</invoke> blocks out of a reply and turn them into tool calls. */
function parseXmlToolCalls(text: string): { clean: string; calls: OaToolCall[] } {
  const calls: OaToolCall[] = [];
  const clean = text.replace(/<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/invoke>/gi, (full, name, body) => {
    const args: Record<string, string> = {};
    const param = /<parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\/parameter>/gi;
    let m: RegExpExecArray | null;
    while ((m = param.exec(body))) args[m[1]] = m[2].trim();
    calls.push({
      id: `xml_${calls.length}_${Date.now().toString(36)}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });
    return "";
  }).trim();
  return { clean, calls };
}

export async function oaChat(p: OpenAiProvider, messages: OaMessage[], tools: ReturnType<typeof toOaTools>, maxTokens: number): Promise<{ content: string; toolCalls: OaToolCall[] }> {
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, ...(tools.length ? { tools, tool_choice: "auto" } : {}), ...(p.extra || {}) }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ProviderError(`${res.status} ${String(data?.error?.message || data?.message || "").slice(0, 160)}`);
  const msg = data?.choices?.[0]?.message || {};
  let toolCalls: OaToolCall[] = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c: OaToolCall) => c?.id && c.function?.name) : [];
  let content = String(msg.content || "").trim();
  // Fallback: model wrote the tool call as XML in the text.
  if (!toolCalls.length && /<invoke\s+name=/i.test(content)) {
    const parsed = parseXmlToolCalls(content);
    if (parsed.calls.length) {
      toolCalls = parsed.calls;
      content = parsed.clean;
    }
  }
  return { content, toolCalls };
}
