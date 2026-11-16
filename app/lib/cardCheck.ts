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
  job: string; casualWear: string; hobbies: string; workAttire: string; romanceArc: string;
  workDays: number[]; workStart: string; workEnd: string; partTime: boolean;
  school: string; classDays: number[]; classStart: string; classEnd: string;
  romantic: boolean; liveIn: boolean; neighbor: boolean; local: boolean;
  attached: string; partner: string; seesOthers: boolean; lesbian: boolean; bigFollowing: boolean;
  gf: boolean; secret: boolean; polyOk: boolean; sapphic: boolean; timeZone: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const days = (d: number[]) => (d || []).map(n => DAYS[n]).filter(Boolean).join(", ");
const yn = (b: boolean) => (b ? "TICKED" : "not ticked");

/** The card as the check reads it: her words, then every tick, side by side. */
function cardText(c: Card, home: string): string {
  return `NAME: ${c.name}
WHERE THE PERSON THEMSELVES LIVES: ${home || "(they haven't said)"}

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
- Romance with them possible: ${yn(c.romantic)}${c.romantic ? ` · girlfriend: ${yn(c.gf)} · kept secret: ${yn(c.secret)} · open to more than one: ${yn(c.polyOk)} · curious about women: ${yn(c.sapphic)} · lesbian: ${yn(c.lesbian)}` : ""}
- Where she stands with other people: ${c.attached || "single"}${c.partner ? ` (${c.partner})` : ""} · might date someone else: ${yn(c.seesOthers)}
- Big following on Picagram: ${yn(c.bigFollowing)}`;
}

const ASK = `You look over ONE character card in a companion app and check it for three things, and ONLY these three:

1. "location" — where she lives doesn't match the location ticks. 📍 Local means within about an hour of the person; 🏘️ Neighbour means a few doors down on the same street; 🏠 Lives with me means she lives in their house. Say something only when her own words put her somewhere that can't be squared with the ticks (a card that says she's in Austin, Texas with 📍 Local ticked; "we share the back bedroom" with 🏠 not ticked). A card that never says where she lives is fine — say nothing.
2. "job" — her job doesn't match the rest of the card: her work hours or her work clothes belong to a different job, the backstory has her doing something else, her job is blank but the card is all about her shifts, she's at a school in the job but no classes/hours are set. Only real mismatches.
3. "boxes" — a tick disagrees with her own words: the description says she's married but the setting says single (or the other way round), it says she lives with them but 🏠 isn't ticked, she's at college in the backstory with no school set, she's described as into women but the lesbian tick disagrees, and so on.

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
