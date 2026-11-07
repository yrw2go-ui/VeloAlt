// 🧠 Which AI Velo chats with. Claude is the default; Qwen and DeepSeek are
// alternatives. Both can come from their own keys, or from Atlas Cloud
// (same ATLASCLOUD_API_KEY you already use for images). Atlas is the fallback
// when a direct key isn't set.
// Model ids come from the environment when set; Atlas has defaults.

export type ChatModel = "claude" | "qwen" | "deepseek";
export const CHAT_MODELS: ChatModel[] = ["claude", "qwen", "deepseek"];

export const MODEL_INFO: Record<ChatModel, { label: string; by: string; where: string }> = {
  claude: { label: "Claude", by: "Anthropic", where: "Processed by Anthropic (US)." },
  qwen: { label: "Qwen", by: "Alibaba / Atlas", where: "Processed by Qwen (Alibaba or Atlas Cloud)." },
  deepseek: { label: "DeepSeek", by: "DeepSeek / Atlas", where: "Processed by DeepSeek (direct or Atlas Cloud)." },
};

export interface OpenAiProvider { baseUrl: string; key: string; model: string; extra?: Record<string, unknown> }

/** Server only: the provider's connection, or null when it isn't set up. */
export function provider(m: ChatModel): OpenAiProvider | null {
  if (m === "qwen") {
    // Prefer a direct Alibaba key if one is set.
    if (process.env.QWEN_API_KEY && process.env.QWEN_MODEL) {
      return { baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", key: process.env.QWEN_API_KEY, model: process.env.QWEN_MODEL, extra: { enable_thinking: false } };
    }
    // Otherwise use Atlas Cloud's Qwen (same key as images).
    if (process.env.ATLASCLOUD_API_KEY) {
      return {
        baseUrl: process.env.ATLAS_QWEN_BASE_URL || "https://api.atlascloud.ai/v1",
        key: process.env.ATLASCLOUD_API_KEY,
        model: process.env.ATLAS_QWEN_MODEL || "qwen/qwen3.6-35b-a3b",
      };
    }
  }
  if (m === "deepseek") {
    // Prefer a direct DeepSeek key if one is set.
    if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_MODEL) {
      return { baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com", key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL };
    }
    // Otherwise use Atlas Cloud's DeepSeek (same key as images).
    if (process.env.ATLASCLOUD_API_KEY) {
      return {
        baseUrl: process.env.ATLAS_DEEPSEEK_BASE_URL || "https://api.atlascloud.ai/v1",
        key: process.env.ATLASCLOUD_API_KEY,
        model: process.env.ATLAS_DEEPSEEK_MODEL || "deepseek-ai/deepseek-v4-flash",
      };
    }
  }
  return null;
}

/** The choices this server can offer (Claude always). */
export const availableModels = (): ChatModel[] => CHAT_MODELS.filter(m => m === "claude" || !!provider(m));
