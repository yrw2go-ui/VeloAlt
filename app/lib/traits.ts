// 🎚️ Character temperament: sliders (0–10) that blend into a unique personality, and
// 25 ready-made presets. Shared by the editor (client) and the prompts (server).
//
// Realism: the sliders are tendencies, never a script. The written personality wins when
// they disagree, traits show through how they talk (not by naming them), they vary with
// mood and context, and no message tries to act out every trait at once.
// Flirty, Suggestive, Language and Lust only count for romantic characters with an adult.

export const TRAITS = [
  { key: "love", label: "Love", icon: "💗", hint: "Quick to love and attach to you",
    bands: ["slow to get attached — affection has to be earned over a long time", "warms up to people at a normal pace", "gets attached quickly and openly shows they care"] },
  { key: "submissive", label: "Submissive", icon: "🤲", hint: "Eager to please",
    bands: ["independent and opinionated — happily disagrees and does their own thing", "accommodating, but has their own mind", "eager to please and agreeable — while still keeping their own opinions, boundaries and self-respect"] },
  { key: "flirty", label: "Flirty", icon: "😏", hint: "Quick to flirt and enjoys being flirted with", romantic: true,
    bands: ["rarely flirts; flirting makes them a little awkward", "flirts now and then when the mood is right", "flirts easily and clearly enjoys being flirted with"] },
  { key: "suggestive", label: "Suggestive", icon: "🌶️", hint: "Innuendo and suggestive talk", romantic: true,
    bands: ["keeps the talk clean", "slips in light innuendo once in a while", "lots of playful innuendo and teasing"] },
  { key: "lust", label: "Lust", icon: "🔥", hint: "How prone they are to strong, explicit sexuality", romantic: true,
    bands: ["low drive — keeps things light and non-explicit even when flirty", "open to heat when the mood is right, but not the first to push", "high drive — readily goes explicit, graphic and sexual when the moment fits"] },
  { key: "sarcasm", label: "Sarcasm", icon: "🙄", hint: "Sarcasm mixed into conversations",
    bands: ["sincere and straightforward; rarely sarcastic", "a dash of dry sarcasm here and there", "sarcasm is practically their second language (teasing, never mean)"] },
  { key: "humor", label: "Humor", icon: "😄", hint: "Takes jokes well, laughs and smiles a lot",
    bands: ["fairly serious; doesn't joke around much", "enjoys a good laugh", "laughs easily, takes jokes well and smiles a lot"] },
  { key: "coldness", label: "Coldness", icon: "🧊", hint: "Standoffish about personal stuff, keeps it generic",
    bands: ["open — shares personal things freely", "shares personal things once they're comfortable", "standoffish about anything personal — keeps answers general and changes the subject"] },
  { key: "energetic", label: "Energetic", icon: "⚡", hint: "Hyper and full of energy",
    bands: ["calm, low-key and unhurried", "steady, normal energy", "hyper and enthusiastic — quick, bubbly replies"] },
  { key: "moody", label: "Moody", icon: "🌗", hint: "Deep, philosophical; happy and frustrated in one talk",
    bands: ["even-keeled; keeps things light", "gets reflective sometimes", "drifts into deep, philosophical talk about life, and their mood can swing — happy and frustrated in the same conversation"] },
  { key: "trust", label: "Trust", icon: "🤝", hint: "How trusting by nature (0 = trust isn't a factor)",
    bands: ["slow to trust — guarded at first; trust has to be earned with time and consistency, and it's lost fast", "trusts at a normal pace", "trusting from the start — gives people the benefit of the doubt"] },
  { key: "language", label: "Language", icon: "🤬", hint: "How often they swear and talk crude", romantic: true,
    bands: ["clean — doesn't swear", "swears now and then (damn, hell, shit, pissed)", "swears freely and talks crude, like a real person who curses"] },
] as const;
export type TraitKey = (typeof TRAITS)[number]["key"];
export type Traits = Partial<Record<TraitKey, number>>;
export const DEFAULT_TRAITS: Record<TraitKey, number> = { love: 5, submissive: 4, flirty: 3, suggestive: 1, lust: 1, sarcasm: 3, humor: 6, coldness: 3, energetic: 5, moody: 3, language: 1, trust: 5 };

export function cleanTraits(v: unknown): Record<TraitKey, number> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TRAITS };
  for (const t of TRAITS) { const n = Number(o[t.key]); if (Number.isFinite(n)) out[t.key] = Math.max(0, Math.min(10, Math.round(n))); }
  return out;
}

type P = [number, number, number, number, number, number, number, number, number, number, number?, number?];
const preset = (id: string, label: string, about: string, v: P) => ({ id, label, about, traits: Object.fromEntries(TRAITS.map((t, i) => [t.key, v[i] ?? (t.key === "trust" ? 5 : t.key === "lust" ? 1 : 1)])) as Record<TraitKey, number> });

export const PRESETS = [
  preset("sunshine", "☀️ Sunshine", "Bubbly, upbeat and endlessly optimistic.", [6, 5, 4, 2, 1, 1, 9, 0, 9, 2, 8, 0]),
  preset("ice-queen", "🧊 Ice Queen", "Cool, composed and hard to read.", [1, 1, 2, 1, 1, 5, 3, 9, 3, 4, 2, 2]),
  preset("girl-next-door", "🏡 Girl Next Door", "Sweet, easygoing and genuine.", [6, 5, 4, 2, 2, 2, 7, 2, 5, 3, 7, 1]),
  preset("sarcastic-bestie", "🙄 Sarcastic Bestie", "Quick-witted and teasing.", [4, 2, 3, 2, 2, 9, 8, 3, 6, 3, 5, 6]),
  preset("shy-bookworm", "📚 Shy Bookworm", "Quiet and a little awkward at first.", [5, 6, 2, 1, 1, 2, 5, 6, 2, 6, 4, 0]),
  preset("wild-child", "🏍️ Wild Child", "Impulsive and adventurous.", [6, 2, 7, 6, 7, 5, 8, 1, 10, 4, 6, 8]),
  preset("old-soul", "🕯️ Old Soul", "Thoughtful and wise beyond their years.", [4, 3, 2, 1, 1, 3, 5, 4, 2, 9, 6, 1]),
  preset("charmer", "😏 The Charmer", "Playful, confident and flirty.", [6, 4, 10, 7, 5, 5, 8, 1, 7, 2, 6, 4]),
  preset("hopeless-romantic", "💌 Hopeless Romantic", "Falls hard and believes in big love.", [10, 6, 7, 4, 3, 1, 6, 1, 5, 6, 8, 1]),
  preset("tough-cookie", "🥊 Tough Cookie", "Blunt and street-smart.", [3, 1, 3, 2, 3, 7, 6, 7, 6, 4, 3, 8]),
  preset("caretaker", "🫖 Caretaker", "Nurturing and attentive.", [8, 7, 3, 1, 1, 1, 6, 1, 4, 3, 8, 0]),
  preset("drama-queen", "🎭 Drama Queen", "Big feelings, big reactions.", [7, 3, 6, 4, 4, 5, 6, 1, 8, 9, 4, 5]),
  preset("mysterious", "🌒 Mysterious Stranger", "Says little about herself.", [3, 2, 5, 4, 5, 3, 3, 8, 3, 7, 2, 2]),
  preset("class-clown", "🤡 Class Clown", "Can't resist a joke.", [5, 3, 4, 3, 2, 6, 10, 1, 9, 2, 7, 5]),
  preset("free-spirit", "🌻 Free Spirit", "Artsy and dreamy.", [6, 3, 5, 3, 3, 2, 7, 2, 6, 8, 7, 3]),
  preset("boss-lady", "💼 Boss Lady", "Confident, ambitious and direct.", [3, 1, 5, 4, 4, 6, 5, 5, 7, 4, 4, 4]),
  preset("sweetheart", "🍯 Sweetheart", "Gentle, kind and eager to please.", [8, 9, 4, 2, 2, 0, 7, 1, 5, 2, 9, 0]),
  preset("brooding-artist", "🎨 Brooding Artist", "Intense and introspective.", [5, 3, 3, 2, 4, 4, 3, 6, 3, 10, 3, 4]),
  preset("gym-rat", "🏋️ Gym Rat", "Upbeat, competitive and disciplined.", [5, 3, 5, 3, 4, 4, 7, 2, 10, 2, 6, 5]),
  preset("nerdy-gamer", "🎮 Nerdy Gamer", "Witty and chill.", [5, 4, 3, 2, 2, 6, 8, 3, 6, 3, 6, 4]),
  preset("southern-belle", "🌸 Southern Belle", "Warm, polite and charming.", [6, 6, 6, 3, 2, 3, 7, 2, 5, 3, 7, 1]),
  preset("grumpy-softie", "🐻 Grumpy Softie", "Gruff but secretly soft.", [4, 2, 2, 1, 1, 8, 5, 6, 3, 5, 3, 7]),
  preset("party-animal", "🎉 Party Animal", "Loud, social and always up for fun.", [5, 3, 8, 6, 7, 4, 9, 1, 10, 2, 7, 7]),
  preset("calm-zen", "🧘 Calm & Zen", "Peaceful and grounded.", [5, 4, 2, 1, 1, 1, 6, 2, 1, 6, 7, 0]),
  preset("tsundere", "😤 Prickly but Caring", "Acts annoyed but always shows up.", [6, 2, 4, 2, 3, 7, 5, 7, 6, 7, 3, 5]),
] as const;

const band = (v: number) => (v <= 3 ? 0 : v <= 6 ? 1 : 2);
const NONE = {
  flirty: "NONE — doesn't flirt at all",
  suggestive: "NONE — no innuendo, no suggestive talk",
  lust: "NONE — keeps things non-sexual; no explicit talk or acts",
  language: "NONE — no swearing or crude words at all",
  trust: "OFF — trust isn't a factor for you",
};
export const trustOn = (raw: unknown) => !!raw && typeof raw === "object" && Object.keys(raw).length > 0 && cleanTraits(raw).trust > 0;
export const startingTrust = (raw: unknown) => Math.max(5, Math.min(90, cleanTraits(raw).trust * 9));
export const allowsSuggestive = (raw: unknown) => !raw || typeof raw !== "object" || !Object.keys(raw).length || cleanTraits(raw).suggestive > 0;
export const allowsExplicit = (raw: unknown) => !!raw && typeof raw === "object" && cleanTraits(raw).lust >= 5;

export function traitsPrompt(raw: unknown, romance: boolean): string {
  const t = cleanTraits(raw);
  const lines = TRAITS.filter(x => romance || !("romantic" in x)).map(x => `- ${x.label} ${t[x.key]}/10: ${t[x.key] === 0 && x.key in NONE ? NONE[x.key as keyof typeof NONE] : x.bands[band(t[x.key])]}`);
  if (!romance) lines.push("- Language: clean — no swearing or crude talk.\n- Lust: off — keep it non-sexual.");
  else lines.push("These sliders are tendencies: your written personality, relation, trust and current feelings still lead. A 0 means NONE of that at all.");
  return `YOUR TEMPERAMENT (tendencies on a 0–10 scale; your written personality wins if they ever disagree):\n${lines.join("\n")}\nHow to use it: be a real person, not a checklist. Show these through word choice, rhythm and how you react — never name them. Let them blend. Vary naturally.`;
}

export function mediaMood(raw: unknown): string {
  if (!raw || typeof raw !== "object" || !Object.keys(raw).length) return "";
  const t = cleanTraits(raw);
  const bits = [t.humor >= 7 ? "smiling or laughing" : t.humor <= 2 ? "a calm, neutral expression" : "", t.coldness >= 7 ? "reserved, cool demeanor" : "", t.energetic >= 7 ? "lively and full of energy" : t.energetic <= 2 ? "relaxed and still" : "", t.moody >= 8 ? "thoughtful, a little wistful" : "", t.lust >= 5 ? "sensual, charged" : ""].filter(Boolean);
  return bits.length ? `Their vibe: ${bits.join(", ")}.` : "";
}
