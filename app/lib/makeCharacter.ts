// ✨ "Make one for me": a whole new character written from a few optional hints (a name, a vibe, a job,
// romantic or not). It only fills in the editor — nothing is saved until they look it over and tap Save,
// where the usual safety check runs.
import { writeText } from "./llm";
import { availableBrains } from "./models";
import { cleanTraits, TRAITS } from "./traits";
import { CHARACTER_VOICES } from "./voices";
import { scrub } from "./secrets";

export type Hints = { name?: string; vibe?: string; job?: string; romantic?: boolean; male?: boolean; avoidNames?: string[] };
const str = (v: unknown, n: number) => scrub(String(v ?? "").replace(/\s+/g, " ").trim()).slice(0, n);

export async function makeCharacter(h: Hints) {
  const kind = h.male ? "male" : "female";
  const sys = `You invent ONE original character for a companion chat app. Make them feel like a real, specific person with a life of their own — not generic. Use the hints if given; invent everything else, varied and surprising (different backgrounds, cities, ages 21–45, looks, jobs, quirks). A ${kind} adult${h.romantic ? " — romance with the user is possible (PG-13), so give them a believable romance arc that starts from who they are, not instant love" : " — friendly and platonic"}. Never a real or famous person. Nothing sexual or explicit.
Reply with ONLY a JSON object with these keys:
"name" (first name${h.avoidNames?.length ? `, not ${h.avoidNames.slice(0, 40).join(", ")}` : ""}), "age" (a number), "personality" (2–4 sentences: how they talk and act), "backstory" (3–5 sentences: where they're from, what shaped them, what they care about), "relation" (who they are to the user, e.g. "a new neighbor you keep running into"), "appearance" (one detailed sentence for a portrait: age, hair, eyes, build, style — no clothing brands), "job" (specific, with a place), "casual_wear", "hobbies", "work_attire", "work_days" (array of day numbers 0=Sun…6=Sat), "work_start" ("HH:MM" 24h), "part_time" (true/false), "birthday" ("MM-DD"), ${h.romantic ? '"romance_arc" (2–3 sentences), ' : ""}"traits" (object of 0–10 numbers for: ${TRAITS.map(t => t.key).join(", ")}; suggestive at most ${h.romantic ? 4 : 1}, language at most 3).`;
  const user = `HINTS (optional — keep any that are given):\nName: ${str(h.name, 40) || "(you pick)"}\nVibe / personality: ${str(h.vibe, 300) || "(surprise me)"}\nJob: ${str(h.job, 120) || "(you pick)"}`;
  // Claude writes it; if Claude can't right now, an Atlas brain (Qwen / DeepSeek) does.
  const raw = await writeText(null, sys, user, 1600).catch(async e => {
    const alt = availableBrains()[0];
    if (!alt) throw e;
    return writeText(alt, sys, user, 1600);
  });
  let j: Record<string, unknown> = {};
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { throw new Error("Couldn't come up with one — try again."); }
  const name = str(h.name, 40) || str(j.name, 40);
  if (!name || !str(j.personality, 10)) throw new Error("Couldn't come up with one — try again.");
  const hhmm = (v: unknown) => (typeof v === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v) ? v : "");
  const start = hhmm(j.work_start), part = j.part_time === true;
  const end = start ? (() => { const [a, b] = start.split(":").map(Number); const t = (a * 60 + b + (part ? 5 : 8) * 60) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })() : "";
  const voices = CHARACTER_VOICES.filter(v => v.kind === kind);
  const v = voices[Math.floor(Math.random() * voices.length)] || CHARACTER_VOICES[0];
  const bday = typeof j.birthday === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(j.birthday) ? j.birthday : "";
  const traits = cleanTraits(j.traits);
  traits.suggestive = Math.min(traits.suggestive, h.romantic ? 4 : 1);
  traits.language = Math.min(traits.language, 3);
  return {
    name, personality: str(j.personality, 2000), backstory: str(j.backstory, 3000), relation: str(j.relation, 600), appearance: str(j.appearance, 600),
    job: str(h.job, 300) || str(j.job, 300), casual_wear: str(j.casual_wear, 400), hobbies: str(j.hobbies, 600), work_attire: str(j.work_attire, 400),
    work_days: [...new Set((Array.isArray(j.work_days) ? j.work_days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))],
    work_start: start, work_end: end, part_time: part, birthday: bday, romantic: !!h.romantic, romance_arc: h.romantic ? str(j.romance_arc, 1500) : "",
    traits, voice: v.voiceId, voice_name: v.name, voice_kind: v.kind,
    age: Number.isInteger(Number(j.age)) && Number(j.age) >= 21 && Number(j.age) <= 60 ? Number(j.age) : null,
  };
}
