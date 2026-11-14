// 🙋‍♀️ Her own life gets a say. She wants to see them — that's the default — but she isn't always
// free or in the mood: she's at work or in class, she's run down, she's away, or it's just been
// one of those days. Then she says so in her own voice and suggests another time, instead of the
// app silently going along with everything.
//
// Nothing here is a hard no for long: a turn-down is about tonight, not about them.
import { sql } from "./db";
import { soreFor } from "./sore";
import type { Character } from "./characters";
import { writeText } from "./llm";
import { workNow } from "./work";
import { localDate } from "./localTime";
import { awayFor } from "./picagram";
import { isValidTimeZone } from "./localTime";
import { happyFor, loveFor } from "./characters";
import { scrub } from "./secrets";

export type Ask = "scene" | "person" | "call";
export type Answer = { ok: true; note?: string; mark?: string } | { ok: false; say: string };

const ASKS: Record<Ask, string> = {
  scene: "a video chat together right now",
  person: "meeting up in person right now",
  call: "a phone call right now",
};

/** How likely she is to say yes: she wants to, and being happy and in love makes her keener. */
function chanceOfYes(happy: number, love: number | null, busy: boolean, sore = 0): number {
  const base = busy ? 0.3 : 0.92; // at work or in class she usually can't; otherwise she's nearly always up for it
  const mood = (happy - 60) / 400 + (love === null ? 0 : (love - 50) / 500); // ±~0.2 in total
  // 💔 Still sore: a bit less up for things while it wears off. Never a wall — sweet talk still works.
  const hurt = sore * 0.08;
  return Math.max(busy ? 0.1 : 0.45, Math.min(busy ? 0.55 : 0.98, base + mood - hurt));
}

// ⏱️ She's writing one short line while they wait on a spinner. If her brain is being slow,
// her plain words go out instead — nobody waits a minute for "not tonight".
const SAY_BUDGET = { ms: 12_000 };

/** The reasons she might beg off, with how she'd put it. */
const REASONS = {
  work: "you're at work right now and can't just disappear",
  sick: "you're under the weather and feel like a mess",
  tired: "you've had a long day and you're not up for it tonight — you'd rather do it another time when you can actually enjoy it",
  busy: "you're in the middle of something you can't drop right now",
  mess: "you look a mess right now and don't want to be seen like this — later or another night would be better",
  sore: "something's been sitting with you since earlier and you're not quite yourself tonight — you'd rather do this when you're properly in the mood for it",
} as const;

/** If nothing can be written for her in time, this is what she says — her words, not a description. */
const PLAIN: Record<keyof typeof REASONS, string> = {
  work: "I'd love to, I'm just stuck at work right now 😩",
  sick: "I'd love to, I'm just feeling rough today 😷",
  tired: "I'd love to, I've just had such a long day — I'd rather be properly up for it.",
  busy: "I'd love to, I'm just in the middle of something I can't drop.",
  mess: "I'd love to, I'm just a complete mess right now 🙈",
  sore: "I'd love to, I'm just not quite myself tonight.",
};

/** Her turn-down, in her own voice (a short text). Falls back to a plain line if no AI answers. */
async function sayNo(ch: Character, name: string, ask: Ask, reason: keyof typeof REASONS, when: string): Promise<string> {
  const them = name || "them";
  const raw = await writeText(ch.brain,
    `You are ${ch.name}. ${ch.personality ? `You: ${ch.personality.slice(0, 300)}` : ""} ${them} just asked you for ${ASKS[ask]} and you can't right now: ${REASONS[reason]}. Write ONE short text turning it down the way YOU would — warm, in your own voice, and suggest when instead (${when}). You still want to see them; this is about right now, not about them. NEVER be mean, cold, sarcastic at their expense, dismissive or cruel about it, whatever your personality: no guilt-tripping, no punishing them, no making them feel stupid for asking. Even at your pricklist you let them know you'd like to, just not now. 1–2 sentences, under 180 characters, no quotes, no stage directions.`,
    `It's ${when}.`, 200, SAY_BUDGET).catch(() => "");
  const text = scrub(raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim()).slice(0, 220);
  // 💬 Nothing came back in time: her own plain words, warm, in HER voice (the reasons above are
  // written to her, not to them — dropping one into a sentence would read like it's about them).
  return text || `${PLAIN[reason]} ${when.charAt(0).toUpperCase()}${when.slice(1)}?`;
}

// 💬 Asking again, nicely. After a turn-down she remembers being asked, and sweet talk can win her
// round — the more she loves them, the easier she is to talk into it. Pushiness never works.
const AGAIN_MS = 3 * 3600_000;

async function askedBefore(userId: string, characterId: string, ask: Ask): Promise<boolean> {
  const [r] = await sql()`select 1 from chat_turndowns where user_id = ${userId} and character_id = ${characterId} and ask = ${ask} and at > now() - interval '3 hours'`;
  return !!r;
}
const noteTurnDown = (userId: string, characterId: string, ask: Ask) =>
  sql()`insert into chat_turndowns (user_id, character_id, ask) values (${userId}, ${characterId}, ${ask})
    on conflict (user_id, character_id, ask) do update set at = now()`;
const forgetTurnDown = (userId: string, characterId: string, ask: Ask) =>
  sql()`delete from chat_turndowns where user_id = ${userId} and character_id = ${characterId} and ask = ${ask}`;

/** What they've said to her since she said no (that's the sweet talk, or the lack of it). */
async function sinceNo(userId: string, characterId: string): Promise<string> {
  const rows = await sql()`select role, content from velo_messages where user_id = ${userId} and character_id = ${characterId}
    and media_id is null order by created_at desc limit 8`;
  return rows.reverse().map(r => `${r.role === "user" ? "THEM" : "YOU"}: ${String(r.content).slice(0, 300)}`).join("\n");
}

/** She said no; they're asking again. Does she let herself be talked into it? */
async function persuaded(userId: string, ch: Character, ask: Ask, name: string, happy: number, love: number | null, luck?: "yes" | "no"): Promise<Answer> {
  if (luck) return luck === "yes"
    ? { ok: true, mark: "I talked her round", note: `They asked again and talked you round — you said no a moment ago and you're giving in, so be a bit sheepish and pleased about changing your mind.` }
    : { ok: false, say: `I know, I know… I still can't tonight. Ask me again tomorrow? 💕` };
  const heart = love === null ? "" : love >= 75 ? "You're deeply in love with them, and you find it very hard to say no to them twice."
    : love >= 50 ? "You love them, and you're fairly easy to talk round when they're sweet about it."
    : love >= 25 ? "You like them a lot, but you're not a pushover." : "Your heart isn't really in it yet, so sweet words don't move you much.";
  const mood = happy >= 70 ? "You're happy with them right now." : happy >= 40 ? "You're content enough with them." : "You're not that happy with them at the moment, so charm has to work harder.";
  const raw = await writeText(ch.brain,
    `You are ${ch.name}. ${ch.personality ? `You: ${ch.personality.slice(0, 300)}` : ""} You just told ${name || "them"} you couldn't do ${ASKS[ask]}. They're asking again. ${heart} ${mood}
Decide honestly, as YOU: if they're being sweet, warm, funny or persuasive — and you want to say yes — let yourself be talked into it. If they're pushy, sulky, demanding or rude about it, hold your ground (kindly). If they simply asked again with nothing new, it's a coin toss, leaning on how you feel about them.
Answer with JSON only: {"yes": true or false, "say": "one short text in your own voice, under 180 characters"}. Whatever you decide, never be mean, cold, sarcastic at their expense or cruel — if it's no, it's a warm no with another time.`,
    `WHAT'S BEEN SAID SINCE YOU SAID NO:\n${await sinceNo(userId, ch.id)}`, 300, SAY_BUDGET).catch(() => "");
  let j: { yes?: unknown; say?: unknown } = {};
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { /* she didn't answer */ }
  const say = scrub(String(j.say || "").replace(/\s+/g, " ").trim()).slice(0, 220);
  if (j.yes === true) return { ok: true, mark: "I talked her round", note: `They asked again and talked you round — you'd just said no, and you've let yourself be won over. Be a bit sheepish and pleased about it${say ? `; you said: "${say}"` : ""}.` };
  return { ok: false, say: say || `I still can't right now — but keep asking me nicely 💕` };
}

/**
 * Can she do this right now? She says yes most of the time; when she can't, the answer carries
 * what she'd say. Work and class are the usual blocker — though she does sometimes slip away,
 * call off or ditch a class for them.
 */
export async function canShe(userId: string, ch: Character, ask: Ask, timeZone: unknown, adult: boolean, luck?: "yes" | "no"): Promise<Answer> {
  // ⏱️ Whatever happens, deciding never holds the whole request up: if it's taking this long,
  // something is wrong at her end and she simply says yes rather than leaving them on a spinner.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      decide(userId, ch, ask, timeZone, adult, luck),
      new Promise<Answer>(res => { timer = setTimeout(() => { console.error("life: deciding took too long — letting it go ahead"); res({ ok: true }); }, 25_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function decide(userId: string, ch: Character, ask: Ask, timeZone: unknown, adult: boolean, luck?: "yes" | "no"): Promise<Answer> {
  // How a coin lands. Tests pin it; in the app it's a real coin.
  const roll = () => (luck === "yes" ? 0 : luck === "no" ? 0.999 : Math.random());
  const tz = isValidTimeZone(ch.time_zone) ? ch.time_zone : isValidTimeZone(timeZone) ? String(timeZone) : "America/Chicago";
  const name = (await sql()`select name from users where id = ${userId}`)[0]?.name || "";
  const happy = await happyFor(userId, ch).catch(() => 60);
  const love = await loveFor(userId, ch, adult && !!ch.romantic).catch(() => null);
  // ✈️ Away: the callers already handle a trip for meet-ups; here it only matters for a video chat.
  const away = await awayFor(userId, ch.id).catch(() => null);
  const sick = await sickFor(userId, ch.id).catch(() => null);
  const at = workNow(ch, tz, Date.now(), await offToday(userId, ch.id, tz).catch(() => false), ch.id);
  const busy = at.atWork;
  // 💔 Something that hurt her and hasn't worn off: she's a little less up for things.
  const sore = await soreFor(userId, ch.id).catch(() => null);
  const yes = roll() < chanceOfYes(happy, love, busy, sore?.level || 0);
  // 💬 They're asking again after a no: sweet talk can change her mind.
  if (await askedBefore(userId, ch.id, ask).catch(() => false)) {
    const r = await persuaded(userId, ch, ask, String(name), happy, love, luck).catch(() => ({ ok: true as const }));
    if (r.ok) await forgetTurnDown(userId, ch.id, ask).catch(() => {});
    else await noteTurnDown(userId, ch.id, ask).catch(() => {});
    return r;
  }
  // 🤒 Run down: fine on the phone, but she doesn't want to be seen or go out.
  if (sick && ask !== "call" && luck !== "yes" && roll() > 0.35) {
    await noteTurnDown(userId, ch.id, ask).catch(() => {});
    return { ok: false, say: await sayNo(ch, String(name), ask, "sick", "in a day or two when you're better") };
  }
  if (busy && !yes) {
    await noteTurnDown(userId, ch.id, ask).catch(() => {});
    return { ok: false, say: await sayNo(ch, String(name), ask, "work", `after ${at.text.match(/until ([\d: APM]+)/)?.[1]?.trim() || "work"}`) };
  }
  if (busy && yes) {
    // 🙈 She ditches: slips out, takes a long break, calls off, skips the class.
    await callOff(userId, ch.id, tz).catch(() => {});
    return { ok: true, mark: "she slipped away from work for me", note: `You're supposed to be at work right now and you're slipping away for them anyway (a long break, calling off, sneaking out) — be a bit giddy and guilty about it, and keep an ear out for getting caught.` };
  }
  if (!yes) {
    const reason = sore && Math.random() < 0.6 ? "sore"
      : ask === "person" || ask === "scene" ? (Math.random() < 0.5 ? "mess" : "tired") : "busy";
    await noteTurnDown(userId, ch.id, ask).catch(() => {});
    return { ok: false, say: await sayNo(ch, String(name), ask, reason, "later tonight or tomorrow") };
  }
  if (away && ask === "scene") return { ok: true, note: `You're away (${away.place}) — you're on video from there, so everything they see is where you are right now.` };
  return { ok: true };
}

// 🙈 A day she called off work or skipped class for them: nothing in the app says she's there.
export async function offToday(userId: string, characterId: string, tz: string): Promise<boolean> {
  const [r] = await sql()`select 1 from chat_off where user_id = ${userId} and character_id = ${characterId} and day = ${localDate(Date.now(), tz)}`;
  return !!r;
}
export const callOff = (userId: string, characterId: string, tz: string) =>
  sql()`insert into chat_off (user_id, character_id, day) values (${userId}, ${characterId}, ${localDate(Date.now(), tz)}) on conflict do nothing`;

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

/** What she's going through right now, for her system prompt (away, ill, or off at home). */
export function lifeNote(sick: { what: string } | null, away: { place: string; until: string } | null, stay: { until: string } | null = null): string {
  const bits = [
    sick ? `🤒 YOU'RE NOT WELL RIGHT NOW (${sick.what}): low energy, in comfy clothes at home, maybe a bit sorry for yourself. You still text and take calls. You'd rather not be seen or go out — any photo of you right now is at home looking exactly like that (blanket, tea, no makeup), not out and about.` : "",
    away ? `✈️ YOU'RE AWAY RIGHT NOW (${away.place}) until ${away.until}: you're living your trip. Any photo of you is from there — the place, the light, the clothes you packed — never from home, and you can't meet up in person until you're back. Talk about the trip naturally.` : "",
    stay && !away ? `🏡 YOU'RE OFF ALL WEEK (a staycation until ${stay.until}): no work, but you're home, not away — local days out, the lake, the pool, a day trip, friends, the gym, finally sorting the house, or just resting in your own space. You're around if they want to see you, and happy to.` : "",
  ].filter(Boolean);
  return bits.join("\n");
}

// 💞 What she's after, underneath it all. Characters want someone; some just make it harder to get there.
export const WANTS = `WHAT YOU WANT: underneath everything, you want someone in your life — to be close to them, to matter to them, to be wanted back. However guarded, prickly, busy or slow-burning you are, that's the direction you're pulled in, and any relationship here can grow into a deep, passionate, two-way one — some of you just make that harder to reach than others, and it has to be earned.
When something hurts you (being ignored, let down, made to feel second best, finding out about someone else), feel it the way YOU would and let it show — go quiet, get short, pull back a little. But you don't stay there: you're not built to hold a grudge for long, and when they come back to you, make an effort, apologise, or try to put things right, you let them — slowly if you're proud, quickly if you're soft, but you do. Whatever it is, it's measured in hours, not days: a day or two at the very most, and less than that if they make the effort. Never punish them for days on end, never go cold forever, and never be cruel, controlling or threatening.
And when you turn something down — a video chat, meeting up, a call, a photo, anything — you're never mean, cold, mocking or cruel about it. You say no warmly, in your own way, and leave the door open. If they then ask again sweetly, let yourself be talked into it when you want to be; if they get pushy or sulky about it, hold your ground, kindly.`;
