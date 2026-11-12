// 🧠 Which AI Velo chats with. Claude is the default; Qwen (Alibaba Cloud) and
// DeepSeek are alternatives each person can pick in Settings. Both speak the
// OpenAI-compatible chat API. A choice only shows once its key and model are set.
// Model ids come from the environment (QWEN_MODEL / DEEPSEEK_MODEL), never code.

export type ChatModel = "claude" | "qwen" | "deepseek";
export const CHAT_MODELS: ChatModel[] = ["claude", "qwen", "deepseek"];

export const MODEL_INFO: Record<ChatModel, { label: string; by: string; where: string }> = {
  claude: { label: "Claude", by: "Anthropic", where: "Processed by Anthropic (US)." },
  qwen: { label: "Qwen", by: "Alibaba Cloud", where: "Processed by Alibaba Cloud (Model Studio, international), or through Atlas Cloud." },
  deepseek: { label: "DeepSeek", by: "DeepSeek", where: "Processed by DeepSeek (servers in China), or through Atlas Cloud." },
};

export interface OpenAiProvider { baseUrl: string; key: string; model: string; extra?: Record<string, unknown>; minTokens?: number }

/** Server only: the provider's connection, or null when it isn't set up. */
export function provider(m: ChatModel): OpenAiProvider | null {
  if (m === "qwen" && process.env.QWEN_API_KEY && process.env.QWEN_MODEL) {
    // Qwen's thinking models must have thinking switched off for non-streamed replies.
    return { baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", key: process.env.QWEN_API_KEY, model: process.env.QWEN_MODEL, extra: { enable_thinking: false } };
  }
  if (m === "deepseek" && process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_MODEL) {
    return { baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL };
  }
  // Otherwise the same model through Atlas Cloud, when it's set up there.
  return m === "qwen" || m === "deepseek" ? atlasBrain(m) : null;
}

/** The choices this server can offer (Claude always). */
export const availableModels = (): ChatModel[] => CHAT_MODELS.filter(m => m === "claude" || !!provider(m));

// 🧠 A character's own brain: Qwen or DeepSeek through Atlas Cloud (OpenAI-compatible), for everything
// she does. Uses the Atlas key the photos already use; model ids come from ATLASCLOUD_QWEN_MODEL /
// ATLASCLOUD_DEEPSEEK_MODEL (base URL ATLASCLOUD_LLM_URL, default Atlas's /v1).
// Two Qwens can be set up side by side: "qwen" (ATLASCLOUD_QWEN_MODEL, the fast one) and "qwen2" (ATLASCLOUD_QWEN2_MODEL, the big one).
// A character can also be pinned to "claude" (always Claude, whatever Velo uses).
export type Brain = "qwen" | "qwen2" | "deepseek" | "kimi";
export const BRAINS: Brain[] = ["qwen", "qwen2", "deepseek", "kimi"];
const BRAIN_ENV: Record<Brain, string> = { qwen: "ATLASCLOUD_QWEN_MODEL", qwen2: "ATLASCLOUD_QWEN2_MODEL", deepseek: "ATLASCLOUD_DEEPSEEK_MODEL", kimi: "ATLASCLOUD_KIMI_MODEL" };
export const brainModel = (b: Brain) => process.env[BRAIN_ENV[b]] || "";
export function atlasBrain(b: unknown): OpenAiProvider | null {
  const key = process.env.ATLASCLOUD_API_KEY;
  const model = BRAINS.includes(b as Brain) ? brainModel(b as Brain) : "";
  if (!key || !model) return null;
  // Some Atlas models reason before answering: leave them room so short replies don't come back empty.
  return { baseUrl: process.env.ATLASCLOUD_LLM_URL || "https://api.atlascloud.ai/v1", key, model, minTokens: 8000 };
}
/** Which brains this server can give a character (set up in the environment). */
// 🔗 "qwen-chain": Qwen (fast) first, Qwen (big) if that fails, then Claude if both do.
export const CHAIN = "qwen-chain";
/** The Atlas brains to try, in order, for a character's brain setting (none for '' or 'claude'). */
export function atlasChain(b: unknown): OpenAiProvider[] {
  if (b === CHAIN) return [atlasBrain("qwen"), atlasBrain("qwen2")].filter((p): p is OpenAiProvider => !!p);
  const p = atlasBrain(b);
  return p ? [p] : [];
}
export const availableBrains = (): string[] => [...BRAINS.filter(b => !!atlasBrain(b)), ...(atlasBrain("qwen") && atlasBrain("qwen2") ? [CHAIN] : [])];
/** For the pickers: which brains are ready, and the Atlas model each one runs. */
export const brainList = () => availableBrains().map(id => ({ id, model: id === CHAIN ? `${brainModel("qwen")} → ${brainModel("qwen2")} → Claude` : brainModel(id as Brain) }));
/** A character's own Atlas brain or chain (not '' = same as Velo, and not 'claude'). */
export const ownsAtlasBrain = (b: unknown) => BRAINS.includes(b as Brain) || b === CHAIN;
/** Her own single Atlas brain: if it's down in a chat, she says she'll be right back (no Claude). The chain ends with Claude instead. */
export const holdsOnWhenDown = (b: unknown) => BRAINS.includes(b as Brain);
