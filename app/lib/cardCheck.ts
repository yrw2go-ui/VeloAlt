// 🛡️ A look over a character card, when you ask for one. It checks three things and nothing else:
//
//   📍 where she lives against the 📍 Local / 🏘️ Neighbour / 🏠 Lives with me ticks and your own town
//   💼 her job against what the card says about her work (hours, attire, the backstory)
//   ☑️ the ticks against the description — married, seeing someone, lesbian, live-in, school…
//
// It never stops anything being saved. It's a second pair of eyes, and the last word is yours.
import { writeText } from "./llm";
import { scrub } from "./secrets";

export type Finding = { what: "location" | "job" | "boxes"; note: string };

export type Card = {
  name: string; personality: string; backstory: string; relation: string; appearance: string;
  job: string; casualWear: string; hobbies: string; workAttire: string; romanceArc: string; livesIn: string;
  workDays: number[]; workStart: string; workEnd: string; partTime: boolean;
  school: string; classDays: number[]; classStart: string; classEnd: string;
  romantic: boolean; liveIn: boolean; neighbor: boolean; local: boolean;
  attached: string; partner: string; seesOthers: boolean; lesbian: boolean; bigFollowing: boolean;
  gf: boolean; secret: boolean; polyOk: boolean; sapphic: boolean; timeZone: string; man: boolean;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = (d: number[]) => (d || []).map(n => DAYS[n]).filter(Boolean).join(", ");
const yn = (b: boolean) => (b ? "TICKED" : "not ticked");

/** The card as the check reads it: her words, then every tick, side by side. */
function cardText(c: Card, home: string): string {
  return `NAME: ${c.name}
MAN OR WOMAN: ${c.man ? "a man" : "a woman"}
WHERE THE PERSON THEMSELVES LIVES: ${home || "(they haven't said)"}
WHERE SHE LIVES NOW (her own field on the card — the only thing that says where she is today): ${c.livesIn || "(blank)"}

WHAT HER CARD SAYS (her own words):
- Who she is to them: ${c.relation || "(blank)"}
- Personality: ${c.personality || "(blank)"}
- Backstory: ${c.backstory || "(blank)"}
- What she looks like: ${c.appearance || "(blank)"}
- Job: ${c.job || "(blank)"}
- What she wears at work: ${c.workAttire || "(blank)"}
- What she usually wears: ${c.casualWear || "(blank)"}
- Hobbies: ${c.hobbies || "(blank)"}
${c.romantic && c.romanceArc ? `- How her feelings can grow: ${c.romanceArc}\n` : ""}
THE TICKS AND SETTINGS ON THE CARD:
- 📍 Local (lives within about an hour of them): ${yn(c.local)}
- 🏘️ Neighbour (a few doors down): ${yn(c.neighbor)}
- 🏠 Lives with me: ${yn(c.liveIn)}
- Work hours: ${c.workStart && c.workEnd ? `${c.workStart}–${c.workEnd} on ${days(c.workDays) || "(no days set)"}${c.partTime ? ", part time" : ""}` : "(none set)"}
- School / classes: ${c.school ? `${c.school}${c.classStart && c.classEnd ? ` ${c.classStart}–${c.classEnd} on ${days(c.classDays) || "(no days set)"}` : ""}` : "(none)"}
- Her time zone: ${c.timeZone || "(same as theirs)"}
- 💕 Romantic: ${yn(c.romantic)}${c.man ? " (on a MAN this means a love life of his own with the WOMEN in the world — never with the person themselves)" : " (romance with the person themselves is possible)"}${c.romantic ? ` · girlfriend: ${yn(c.gf)} · kept secret: ${yn(c.secret)} · open to more than one: ${yn(c.polyOk)} · curious about women: ${yn(c.sapphic)} · lesbian: ${yn(c.lesbian)}` : ""}
- Where she stands with other people: ${c.attached || "single"}${c.partner ? ` (${c.partner})` : ""} · might date someone else: ${yn(c.seesOthers)}
- Big following on Picagram: ${yn(c.bigFollowing)}`;
}

const ASK = `You look over ONE character card in a companion app and check it for three things, and ONLY these three:

1. "location" — WHERE SHE LIVES NOW doesn't match the location ticks. 📍 Local means within about an hour of the person; 🏘️ Neighbour means a few doors down on the same street; 🏠 Lives with me means she lives in their house. Judge this by the WHERE SHE LIVES NOW field and nothing else. Where she grew up, where she was born, where she used to live, where her family is, and where she WORKS are all beside the point: a woman who grew up in Arizona and works in Chicago but lives in Munster, Indiana is local, and saying otherwise is the mistake to avoid. When that field is blank, say nothing about location at all — don't go hunting through her backstory for a town. When it is filled in, speak up only if that place can't be squared with the ticks (Austin, Texas with 📍 Local ticked; or "we share the back bedroom" in her description with 🏠 not ticked).
2. "job" — her job doesn't match the rest of the card (a job in another town than she lives in is NOT a mismatch — people commute, and plenty of jobs are remote): her work hours or her work clothes belong to a different job, the backstory has her doing something else, her job is blank but the card is all about her shifts, she's at a school in the job but no classes/hours are set. Only real mismatches.
3. "boxes" — a tick disagrees with her own words: the description says she's married but the setting says single (or the other way round), it says she lives with them but 🏠 isn't ticked, she's at college in the backstory with no school set, she's described as into women but the lesbian tick disagrees, and so on. On a MAN'S card, 💕 Romantic does NOT mean he's interested in the person he talks to: it means he has a love life of his own with the women in the world. So a man whose description says he's just a friend to them, or has no interest in them, is NOT a clash with 💕 — never report that.

Rules: be strict about what counts. Only speak up when the card genuinely contradicts itself — not when something is merely missing, vague or could go either way. Nothing about safety, taste, age or content: that's not your job here. Each note is ONE short sentence naming both sides of the clash, in plain words, no jargon, no advice about what they "should" do.

Reply with JSON only: {"findings":[{"what":"location"|"job"|"boxes","note":"..."}]} — an empty list when the card hangs together.`;

/** 🛡️ The three checks. Never throws: a check that can't run just finds nothing. */
export async function checkCard(c: Card, home: string): Promise<Finding[]> {
  const raw = await writeText("", ASK, scrub(cardText(c, home)).slice(0, 6000), 1200).catch(() => "");
  let j: { findings?: unknown } = {};
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { return []; }
  const list = Array.isArray(j.findings) ? j.findings : [];
  return list
    .map(f => ({ what: String((f as Finding)?.what || ""), note: scrub(String((f as Finding)?.note || "")).replace(/\s+/g, " ").trim().slice(0, 300) }))
    .filter((f): f is Finding => (f.what === "location" || f.what === "job" || f.what === "boxes") && f.note.length > 3)
    .slice(0, 6);
}

export const WHAT_IT_IS: Record<Finding["what"], string> = {
  location: "📍 Where she lives",
  job: "💼 Her job",
  boxes: "☑️ The ticks",
};
