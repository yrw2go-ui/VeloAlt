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
