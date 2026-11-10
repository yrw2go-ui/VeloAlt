// 🧠 A character's brain choices (client + server). '' = same as Velo; the Atlas ones need their model set up.
export const BRAIN_OPTIONS = [
  { id: "claude", label: "Claude", atlas: false, about: "Always Claude, whatever Velo uses." },
  { id: "qwen", label: "Qwen (fast)", atlas: true, about: "Through Atlas Cloud — quick and cheap." },
  { id: "qwen2", label: "Qwen (big)", atlas: true, about: "Through Atlas Cloud — smarter, follows the details better." },
  { id: "deepseek", label: "DeepSeek", atlas: true, about: "Through Atlas Cloud." },
] as const;
export const brainLabel = (id: string | undefined) => BRAIN_OPTIONS.find(o => o.id === id)?.label || "";
