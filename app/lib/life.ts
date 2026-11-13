// 🙋‍♀️ Her own life gets a say. She wants to see them — that's the default — but she isn't always
// free or in the mood: she's at work or in class, she's run down, she's away, or it's just been
// one of those days. Then she says so in her own voice and suggests another time, instead of the
// app silently going along with everything.
//
// Nothing here is a hard no for long: a turn-down is about tonight, not about them.
import { sql } from "./db";
import type { Character } from "./characters";
import { writeText } from "./llm";
import { workNow } from "./work";
import { awayFor } from "./picagram";
import { isValidTimeZone } from "./localTime";
import { happyFor, loveFor } from "./characters";
import { scrub } from "./secrets";

export type Ask = "scene" | "person" | "call";
export type Answer = { ok: true; note?: string } | { ok: false; say: string };

const ASKS: Record<Ask, string> = {
  scene: "a video chat together right now",
  person: "meeting up in person right now",
  call: "a phone call right now",
};

/** How likely she is to say yes: she wants to, and being happy and in love makes her keener. */
function chanceOfYes(happy: number, love: number | null, busy: boolean): number {
  const base = busy ? 0.3 : 0.92; // at work or in class she usually can't; otherwise she's nearly always up for it
  const mood = (happy - 60) / 400 + (love === null ? 0 : (love - 50) / 500); // ±~0.2 in total
  return Math.max(busy ? 0.12 : 0.6, Math.min(busy ? 0.55 : 0.98, base + mood));
}

/** The reasons she might beg off, with how she'd put it. */
const REASONS = {
  work: "you're at work right now and can't just disappear",
  sick: "you're under the weather and feel like a mess",
  tired: "you've had a long day and you're not up for it tonight — you'd rather do it another time when you can actually enjoy it",
  busy: "you're in the middle of something you can't drop right now",
  mess: "you look a mess right now and don't want to be seen like this — later or another night would be better",
} as const;

/** Her turn-down, in her own voice (a short text). Falls back to a plain line if no AI answers. */
async function sayNo(ch: Character, name: string, ask: Ask, reason: keyof typeof REASONS, when: string): Promise<string> {
  const them = name || "them";
  const raw = await writeText(ch.brain,
    `You are ${ch.name}. ${ch.personality ? `You: ${ch.personality.slice(0, 300)}` : ""} ${them} just asked you for ${ASKS[ask]} and you can't right now: ${REASONS[reason]}. Write ONE short text turning it down the way YOU would — warm, in your own voice, and suggest when instead (${when}). You still want to see them; this is about right now, not about them. 1–2 sentences, under 180 characters, no quotes, no stage directions.`,
    `It's ${when}.`, 200).catch(() => "");
  const text = scrub(raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim()).slice(0, 220);
  return text || `Can't right now — ${REASONS[reason]}. Let's do it ${when}?`;
}

/**
 * Can she do this right now? She says yes most of the time; when she can't, the answer carries
 * what she'd say. Work and class are the usual blocker — though she does sometimes slip away,
 * call off or ditch a class for them.
 */
export async function canShe(userId: string, ch: Character, ask: Ask, timeZone: unknown, adult: boolean, luck?: "yes" | "no"): Promise<Answer> {
  // How a coin lands. Tests pin it; in the app it's a real coin.
  const roll = () => (luck === "yes" ? 0 : luck === "no" ? 0.999 : Math.random());
  const tz = isValidTimeZone(ch.time_zone) ? ch.time_zone : isValidTimeZone(timeZone) ? String(timeZone) : "America/Chicago";
  const name = (await sql()`select name from users where id = ${userId}`)[0]?.name || "";
  const happy = await happyFor(userId, ch).catch(() => 60);
  const love = await loveFor(userId, ch, adult && !!ch.romantic).catch(() => null);
  // ✈️ Away: the callers already handle a trip for meet-ups; here it only matters for a video chat.
  const away = await awayFor(userId, ch.id).catch(() => null);
  const sick = await sickFor(userId, ch.id).catch(() => null);
  const at = workNow(ch, tz);
  const busy = at.atWork;
  const yes = roll() < chanceOfYes(happy, love, busy);
  // 🤒 Run down: fine on the phone, but she doesn't want to be seen or go out.
  if (sick && ask !== "call" && luck !== "yes" && roll() > 0.35) {
    return { ok: false, say: await sayNo(ch, String(name), ask, "sick", "in a day or two when you're better") };
  }
  if (busy && !yes) {
    return { ok: false, say: await sayNo(ch, String(name), ask, "work", `after ${at.text.match(/until ([\d: APM]+)/)?.[1]?.trim() || "work"}`) };
  }
  if (busy && yes) {
    // 🙈 She ditches: slips out, takes a long break, calls off, skips the class.
    return { ok: true, note: `You're supposed to be at work right now and you're slipping away for them anyway (a long break, calling off, sneaking out) — be a bit giddy and guilty about it, and keep an ear out for getting caught.` };
  }
  if (!yes) {
    const reason = ask === "person" || ask === "scene" ? (Math.random() < 0.5 ? "mess" : "tired") : "busy";
    return { ok: false, say: await sayNo(ch, String(name), ask, reason, "later tonight or tomorrow") };
  }
  if (away && ask === "scene") return { ok: true, note: `You're away (${away.place}) — you're on video from there, so everything they see is where you are right now.` };
  return { ok: true };
}

// 🤒 Off colour for a few days: she still texts and calls, she just doesn't want to be seen or go out.
export async function sickFor(userId: string, characterId: string): Promise<{ what: string; until: string } | null> {
  const [r] = await sql()`select place as what, until::text from chat_away
    where user_id = ${userId} and character_id = ${characterId} and kind = 'sick' and until >= current_date`;
  return r ? { what: String(r.what || "under the weather"), until: String(r.until) } : null;
}
export async function makeSick(userId: string, characterId: string, what: string, days: number) {
  await sql()`insert into chat_away (user_id, character_id, place, until, kind) values (${userId}, ${characterId}, ${what.slice(0, 80)}, current_date + ${days}::int, 'sick')
    on conflict (user_id, character_id) do update set place = excluded.place, until = excluded.until, kind = 'sick'`;
}

/** What she's going through right now, for her system prompt (away or ill). */
export function lifeNote(sick: { what: string } | null, away: { place: string; until: string } | null): string {
  const bits = [
    sick ? `🤒 YOU'RE NOT WELL RIGHT NOW (${sick.what}): low energy, in comfy clothes at home, maybe a bit sorry for yourself. You still text and take calls. You'd rather not be seen or go out — any photo of you right now is at home looking exactly like that (blanket, tea, no makeup), not out and about.` : "",
    away ? `✈️ YOU'RE AWAY RIGHT NOW (${away.place}) until ${away.until}: you're living your trip. Any photo of you is from there — the place, the light, the clothes you packed — never from home, and you can't meet up in person until you're back. Talk about the trip naturally.` : "",
  ].filter(Boolean);
  return bits.join("\n");
}

// 💞 What she's after, underneath it all. Characters want someone; some just make it harder to get there.
export const WANTS = `WHAT YOU WANT: underneath everything, you want someone in your life — to be close to them, to matter to them, to be wanted back. However guarded, prickly, busy or slow-burning you are, that's the direction you're pulled in, and any relationship here can grow into a deep, passionate, two-way one — some of you just make that harder to reach than others, and it has to be earned.
When something hurts you (being ignored, let down, made to feel second best, finding out about someone else), feel it the way YOU would and let it show — go quiet, get short, pull back a little. But you don't stay there: you're not built to hold a grudge for long, and when they come back to you, make an effort, apologise, or try to put things right, you let them — slowly if you're proud, quickly if you're soft, but you do. Never punish them for days on end, never go cold forever, and never be cruel, controlling or threatening.`;
