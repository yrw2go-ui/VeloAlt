// 🧠 One brain, picked in Settings — and nothing else.
// Whatever is chosen there ("claude", "qwen", "deepseek", …) is what writes everything.
// If Claude is chosen, only Claude is used; if Qwen is chosen, Claude is never quietly
// asked instead. The ONE exception is a backup, which is off unless it's switched on:
// then, and only then, a second brain is tried when the first one can't answer.

/** The brains to try, in order. "claude" means Anthropic; anything else is an Atlas brain. */
export function brainOrder(picked: unknown, backup: unknown): string[] {
  const first = String(picked || "").trim() || "claude";
  const second = String(backup || "").trim();
  return second && second !== first ? [first, second] : [first];
}

/** 🛟 The backup choices, off by default. "" is off. */
export const BACKUP_OPTIONS = [
  { id: "claude", label: "Claude", about: "Anthropic's — the steadiest, and the dearest." },
  { id: "qwen", label: "Qwen", about: "Alibaba Cloud's, through Atlas — quick and cheap." },
  { id: "deepseek", label: "DeepSeek", about: "Through Atlas — cheap." },
] as const;

/** 💵 Roughly what one new Picagram face costs in words, per brain. An estimate, not a bill:
 *  about a thousand words in and sixteen hundred out. Her photo costs the same either way. */
export const ROUGH_COST: Record<string, string> = {
  claude: "about 2–3¢",
  qwen: "well under 1¢",
  qwen2: "about 1¢",
  deepseek: "well under 1¢",
  kimi: "well under 1¢",
};
export const roughCost = (id: string) => ROUGH_COST[id] || "a penny or so";

/** The other brains worth offering as a retry, once the picked one couldn't do it. */
export function retryChoices(picked: unknown, ready: string[]): { id: string; label: string; cost: string }[] {
  const first = String(picked || "").trim() || "claude";
  const label: Record<string, string> = { claude: "Claude", qwen: "Qwen (fast)", qwen2: "Qwen (big)", deepseek: "DeepSeek", kimi: "Kimi" };
  return ["claude", "qwen", "qwen2", "deepseek", "kimi"]
    .filter(id => id !== first && (id === "claude" || ready.includes(id)))
    .map(id => ({ id, label: label[id] || id, cost: roughCost(id) }));
}

// 💬 Comments are the cheapest thing on Picagram and the most numerous, so they never go to
// Claude. The cheap brains, cheapest first (roughly, per million words out: Qwen the fast one
// about 20¢, DeepSeek about 30¢, Kimi about 60¢ — change the order here if the prices move).
export const COMMENT_ORDER = ["qwen", "deepseek", "kimi"] as const;
/** The cheap brains to write comments with, cheapest first. Empty = nobody: the free lines do it. */
export const commentBrains = (ready: string[]): string[] => COMMENT_ORDER.filter(id => ready.includes(id));
