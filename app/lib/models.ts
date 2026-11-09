// 🧠 Which AI Velo chats with. Claude is the default; Qwen (Alibaba Cloud) and
// DeepSeek are alternatives each person can pick in Settings. Both speak the
// OpenAI-compatible chat API. A choice only shows once its key and model are set.
// Model ids come from the environment (QWEN_MODEL / DEEPSEEK_MODEL), never code.

export type ChatModel = "claude" | "qwen" | "deepseek";
export const CHAT_MODELS: ChatModel[] = ["claude", "qwen", "deepseek"];

export const MODEL_INFO: Record<ChatModel, { label: string; by: string; where: string }> = {
  claude: { label: "Claude", by: "Anthropic", where: "Processed by Anthropic (US)." },
  qwen: { label: "Qwen", by: "Alibaba Cloud", where: "Processed by Alibaba Cloud (Model Studio, international)." },
  deepseek: { label: "DeepSeek", by: "DeepSeek", where: "Processed by DeepSeek (servers in China)." },
};

export interface OpenAiProvider { baseUrl: string; key: string; model: string; extra?: Record<string, unknown> }

/** Server only: the provider's connection, or null when it isn't set up. */
export function provider(m: ChatModel): OpenAiProvider | null {
  if (m === "qwen" && process.env.QWEN_API_KEY && process.env.QWEN_MODEL) {
    // Qwen's thinking models must have thinking switched off for non-streamed replies.
    return { baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", key: process.env.QWEN_API_KEY, model: process.env.QWEN_MODEL, extra: { enable_thinking: false } };
  }
  if (m === "deepseek" && process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_MODEL) {
    return { baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL };
  }
  return null;
}

/** The choices this server can offer (Claude always). */
export const availableModels = (): ChatModel[] => CHAT_MODELS.filter(m => m === "claude" || !!provider(m));

// 🧠 A character's own brain: Qwen or DeepSeek through Atlas Cloud (OpenAI-compatible), for everything
// she does. Uses the Atlas key the photos already use; model ids come from ATLASCLOUD_QWEN_MODEL /
// ATLASCLOUD_DEEPSEEK_MODEL (base URL ATLASCLOUD_LLM_URL, default Atlas's /v1).
export type Brain = "qwen" | "deepseek";
export const BRAINS: Brain[] = ["qwen", "deepseek"];
export function atlasBrain(b: unknown): OpenAiProvider | null {
  const key = process.env.ATLASCLOUD_API_KEY;
  const model = b === "qwen" ? process.env.ATLASCLOUD_QWEN_MODEL : b === "deepseek" ? process.env.ATLASCLOUD_DEEPSEEK_MODEL : "";
  if (!key || !model) return null;
  return { baseUrl: process.env.ATLASCLOUD_LLM_URL || "https://api.atlascloud.ai/v1", key, model };
}
/** Which brains this server can give a character (set up in the environment). */
export const availableBrains = (): Brain[] => BRAINS.filter(b => !!atlasBrain(b));
