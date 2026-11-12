// 🧠 A character's brain choices (client + server). '' = same as Velo; the Atlas ones need their model set up.
export const BRAIN_OPTIONS = [
  { id: "claude", label: "Claude", atlas: false, about: "Always Claude, whatever Velo uses." },
  { id: "qwen", label: "Qwen (fast)", atlas: true, about: "Through Atlas Cloud — quick and cheap." },
  { id: "qwen2", label: "Qwen (big)", atlas: true, about: "Through Atlas Cloud — smarter, follows the details better." },
  { id: "deepseek", label: "DeepSeek", atlas: true, about: "Through Atlas Cloud." },
  { id: "kimi", label: "Kimi K2.6", atlas: true, about: "Through Atlas Cloud — Moonshot K2.6." },
  { id: "qwen-chain", label: "Qwen chain: fast → big → Claude", atlas: true, about: "Qwen (fast) first; if it fails, Qwen (big); if both fail, Claude." },
] as const;
export const brainLabel = (id: string | undefined) => BRAIN_OPTIONS.find(o => o.id === id)?.label || "";
