// ✨ "Make one for me": a whole new character written from a few optional hints (a name, a vibe, a job,
// romantic or not). It only fills in the editor — nothing is saved until they look it over and tap Save,
// where the usual safety check runs.
import { sql } from "./db";
import { writeText } from "./llm";
import { availableBrains } from "./models";
import { cleanTraits, TRAITS } from "./traits";
import { CHARACTER_VOICES } from "./voices";
import { scrub } from "./secrets";
import { vibeNote, rollLesbian, LESBIAN_ASK, AGE_FROM, AGE_TO, clearName } from "./vibes";
import { defaults as wordDefaults, type Words } from "./words";

export type Hints = { name?: string; vibe?: string; job?: string; romantic?: boolean; male?: boolean; avoidNames?: string[]; lives?: string; liveIn?: boolean; local?: boolean; lesbian?: boolean; words?: Words };
const str = (v: unknown, n: number) => scrub(String(v ?? "").replace(/\s+/g, " ").trim()).slice(0, n);

/** 🙅 Every name already in their world — characters and the people on their Picagram — so a new
 *  one never comes out as a second Chloe. First names, since that's all a character has. */
export async function usedNames(userId: string): Promise<string[]> {
  const rows = await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}
    union select name from pica_accounts where user_id = ${userId}`;
  return [...new Set(rows.map(r => String(r.name || "").trim().split(/\s+/)[0]).filter(Boolean))].slice(0, 60);
}

export async function makeCharacter(h: Hints) {
  const kind = h.male ? "male" : "female";
  // ⚢ Rare, and only for a woman romance is on for: about one in seventeen.
  const lesbian = !h.male && !!h.romantic && (h.lesbian === true || (h.lesbian === undefined && rollLesbian()));
  const w = { ...wordDefaults(), ...(h.words || {}) }; // 🛠️ Admin → Messaging & wording
  const sys = `${w.make_brief} A ${kind} adult${h.romantic ? " — romance with the user is possible (PG-13), so give them a believable romance arc that starts from who they are, not instant love" : " — friendly and platonic"}. Never a real or famous person. Nothing sexual or explicit.${h.lives ? `\n${h.lives}` : ""}${h.male || str(h.vibe, 300) ? "" : `\n${vibeNote([], w)}`}${lesbian ? `\n${LESBIAN_ASK}` : ""}${h.liveIn ? `
${w.make_livein}` : ""}
Reply with ONLY a JSON object with these keys:
"name" (first name${h.avoidNames?.length ? `, not ${h.avoidNames.slice(0, 40).join(", ")}` : ""}), "age" (a number, ${h.male ? "21–45" : `${AGE_FROM}–${AGE_TO}`}), "personality" (2–4 sentences: how they talk and act), "backstory" (3–5 sentences: where they're from, what shaped them, what they care about), "relation" (who they are to the user, e.g. "a new neighbor you keep running into"), "appearance" (one detailed sentence for a portrait: age, hair, eyes, build, style — no clothing brands), "lives_in" (the town or city where they live NOW, as "Town, ST" — where they are today, not where they grew up, and it must match where the backstory puts them now), "job" (specific, with a place), "casual_wear", "hobbies", "work_attire", "work_days" (array of day numbers 0=Sun…6=Sat), "work_start" ("HH:MM" 24h), "part_time" (true/false), "birthday" ("MM-DD"), ${h.romantic ? '"romance_arc" (2–3 sentences), ' : ""}${lesbian ? '"lesbian_personality" (as described above), ' : ""}"traits" (object of 0–10 numbers for: ${TRAITS.map(t => t.key).join(", ")}; suggestive at most ${h.romantic ? 4 : 1}, language at most 3).`;
  const user = `HINTS (optional — keep any that are given):\nName: ${str(h.name, 40) || "(you pick)"}\nVibe / personality: ${str(h.vibe, 300) || "(surprise me)"}\nJob: ${str(h.job, 120) || "(you pick)"}`;
  // Claude writes it; if Claude can't right now, an Atlas brain (Qwen / DeepSeek) does.
  const ask = (tokens: number) => writeText(null, sys, user, tokens).catch(async e => {
    const alt = availableBrains()[0];
    if (!alt) throw e;
    return writeText(alt, sys, user, tokens);
  });
  // 🪫 She's a lot to write: if the JSON comes back cut off, one more go with twice the room
  // rather than "couldn't come up with one".
  let j: Record<string, unknown> = {};
  let name = "";
  for (const tokens of [3000, 6000]) {
    const raw = await ask(tokens);
    try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { j = {}; }
    name = str(h.name, 40) || str(j.name, 40);
    if (name && str(j.personality, 10)) break;
    console.error(`makeCharacter: nothing usable back at ${tokens} tokens${tokens === 3000 ? " — asking again with more room" : ""}`);
    j = {}; name = "";
  }
  if (!name || !str(j.personality, 10)) throw new Error("Couldn't come up with one — try again.");
  // 🙅 It was told which names are taken; if it used one anyway (and you didn't ask for it
  // yourself), swap in an ordinary one nobody has.
  if (!str(h.name, 40)) name = clearName(name, h.avoidNames || []);
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
    lives_in: str(j.lives_in, 120), job: str(h.job, 300) || str(j.job, 300), casual_wear: str(j.casual_wear, 400), hobbies: str(j.hobbies, 600), work_attire: str(j.work_attire, 400),
    work_days: [...new Set((Array.isArray(j.work_days) ? j.work_days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))],
    work_start: start, work_end: end, part_time: part, birthday: bday, romantic: !!h.romantic, romance_arc: h.romantic ? str(j.romance_arc, 1500) : "",
    // ⚢ Only if she is: the tick, and the version of her that's used while it's on.
    lesbian, lesbian_personality: lesbian ? str(j.lesbian_personality, 2000) || str(j.personality, 2000) : "",
    traits, voice: v.voiceId, voice_name: v.name, voice_kind: v.kind,
    age: Number.isInteger(Number(j.age)) && Number(j.age) >= 21 && Number(j.age) <= 60 ? Number(j.age) : null,
  };
}
