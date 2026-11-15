// 🏘️ Neighbours. She lives a few doors down — she knows it, and she can see when you're in.
//
// While you're marked home she might turn up at the door now and then, or spot your car and ask
// you to come over. Only people you're actually close to do that. Not answering costs nothing:
// she never knows you were standing there, and nothing about how she feels changes.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { type Character, getCharacterFor, happyFor, loveFor, trustFor } from "./characters";
import { workNow } from "./work";
import { awayFor } from "./picagram";
import { offToday, sickFor } from "./life";
import { soreFor } from "./sore";
import { isValidTimeZone, zonedParts } from "./localTime";
import { startInPerson } from "./inPerson";

export type DropIn = { id: string; characterId: string; who: string; portrait: string | null; kind: "door" | "over"; line: string };

/** What her card says about living on your street, so she lives it rather than announcing it. */
export const NEIGHBOR_NOTE = `🏘️ YOU'RE THEIR NEIGHBOUR — you live a few doors down on the same street, and you both know it. You see their car come and go, you pass the house, you run into each other outside. You can say so naturally ("saw your light on", "I'm two minutes away"), pop round, or ask them over, the way neighbours do — never as a big announcement.`;

/** Her line when she's actually at the door, or asking you over. */
const NOTE = (kind: "door" | "over") => kind === "door"
  ? `🔔 YOU'RE AT THEIR DOOR RIGHT NOW — you walked down and knocked, and they've just opened it. You're standing on their step: talk face to face, present tense, a little bit of why you came (bored, something to show them, an excuse you half-admit is an excuse). Don't text-talk, and don't act surprised to be there.`
  : `🏡 THEY'VE JUST COME OVER TO YOURS — you spotted their car and asked them round, and here they are, in your place. Talk face to face, present tense, and be glad they came.`;

// 🏠 One switch for the whole street: are you in?
export async function atHome(userId: string): Promise<boolean> {
  const [u] = await sql()`select at_home from users where id = ${userId}`;
  return !!u?.at_home;
}
export async function setAtHome(userId: string, home: boolean): Promise<boolean> {
  await sql()`update users set at_home = ${home}, at_home_at = now(), updated_at = now() where id = ${userId}`;
  return home;
}

/** Anyone standing there right now (the popup reads this). */
export async function waitingDropIn(userId: string): Promise<DropIn | null> {
  const [r] = await sql()`select d.id, d.character_id, d.kind, d.line, c.name, f.url as portrait
    from chat_dropins d join chat_characters c on c.id = d.character_id left join velo_files f on f.id = c.portrait_file_id
    where d.user_id = ${userId} and d.status = 'waiting' and d.created_at > now() - interval '20 minutes'
    order by d.created_at desc limit 1`;
  return r ? { id: String(r.id), characterId: String(r.character_id), who: String(r.name), portrait: r.portrait ? String(r.portrait) : null, kind: r.kind, line: String(r.line) } : null;
}

/** 🙋 You asked her over in the last few hours — then she can turn up whether or not you're close. */
const ASKED = /\b(come (over|round|by)|pop (over|round|by)|stop by|swing by|head over|come see me|you should come)\b/i;
async function invited(userId: string, characterId: string): Promise<boolean> {
  const rows = await sql()`select content from velo_messages where user_id = ${userId} and character_id = ${characterId}
    and role = 'user' and created_at > now() - interval '3 hours' order by created_at desc limit 20`;
  return rows.some(r => ASKED.test(String(r.content || "")));
}

/** Close enough to just turn up: someone you're genuinely in each other's lives with. */
async function closeEnough(userId: string, c: Character): Promise<boolean> {
  const happy = await happyFor(userId, c).catch(() => 60);
  const trust = await trustFor(userId, c).catch(() => null);
  const love = await loveFor(userId, c, !!c.romantic).catch(() => null);
  return happy >= 70 || (trust ?? 0) >= 65 || (love ?? 0) >= 55;
}

/** A decent hour where she is, and she isn't at work, in class, away or poorly. */
async function free(userId: string, c: Character): Promise<boolean> {
  const tz = isValidTimeZone(c.time_zone) ? c.time_zone : "America/Chicago";
  const { hour } = zonedParts(Date.now(), tz);
  if (hour < 9 || hour >= 22) return false;
  if (workNow(c, tz, Date.now(), await offToday(userId, c.id, tz).catch(() => false), c.id).atWork) return false;
  if (await awayFor(userId, c.id).catch(() => null)) return false;
  if (await sickFor(userId, c.id).catch(() => null)) return false;
  if (await soreFor(userId, c.id).catch(() => null)) return false; // 💔 not while something's still sitting with her
  return true;
}

const LINES = {
  door: ["*knock knock* hey — you busy?", "hey, saw your light on. Thought I'd come say hi 🙂", "*knocks* it's only me — I was two doors away, so."],
  over: ["saw your car outside — come over for a bit? 🙂", "you're home! Come round, I've got the kettle on.", "spotted your car. Come over, I'm bored out of my mind."],
};

/** Her own words for turning up — hers if her brain answers, otherwise something plain and true. */
async function knockLine(c: Character, kind: "door" | "over", name: string): Promise<string> {
  const plain = LINES[kind][Math.floor(Math.random() * LINES[kind].length)];
  const raw = await writeText(c.brain, `You are ${c.name}. ${c.personality || ""}
You live a few doors down from ${name || "them"}. ${kind === "door" ? "You've just walked down and knocked on their door — they haven't opened it yet." : "You've seen their car outside, so you're messaging to ask them over to yours."} Write ONE short line in your own voice, the way you'd really say it — under 120 characters, no quotes, no name sign-off. Just the line.`,
    kind === "door" ? "You're standing on their step." : "You're asking them over.", 60, { ms: 8_000 }).catch(() => "");
  const line = scrub(raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim()).slice(0, 200);
  return line || plain;
}

/**
 * 🔔 The roll, made while they're home. At most one caller at a time, a few hours between visits
 * from the same person, and only from someone close. Nobody is ever "due" a visit.
 */
export async function maybeDropIn(userId: string, chance = 0.08): Promise<DropIn | null> {
  const waiting = await waitingDropIn(userId);
  if (waiting) return waiting;
  if (!(await atHome(userId))) return null;
  // One drop-in an hour at the very most, whoever it is.
  const [recent] = await sql()`select 1 from chat_dropins where user_id = ${userId} and created_at > now() - interval '1 hour'`;
  if (recent) return null;
  const rows = await sql()`select c.id from chat_characters c
    where c.created_by = ${userId} and c.neighbor and (c.owner_id is null or c.intro_status = 'accepted')
      and not exists (select 1 from chat_dropins d where d.character_id = c.id and d.created_at > now() - interval '6 hours')`;
  if (!rows.length) return null;
  const [u] = await sql()`select name from users where id = ${userId}`;
  // Shuffle, then take the first one who's close enough and actually free.
  for (const r of rows.sort(() => Math.random() - 0.5)) {
    const c = await getCharacterFor(userId, String(r.id)).catch(() => null);
    if (!c || !(await free(userId, c))) continue;
    // You asked her over: she's much likelier to actually come. Otherwise only someone close turns
    // up unannounced, and even then only now and then.
    const asked = await invited(userId, c.id).catch(() => false);
    if (!asked && !(await closeEnough(userId, c))) continue;
    if (Math.random() > (asked ? Math.max(chance, 0.5) : chance)) continue;
    const kind: "door" | "over" = Math.random() < 0.6 ? "door" : "over";
    const line = await knockLine(c, kind, String(u?.name || ""));
    const [row] = await sql()`insert into chat_dropins (user_id, character_id, kind, line) values (${userId}, ${c.id}, ${kind}, ${line.slice(0, 300)}) returning id`;
    return { id: String(row.id), characterId: c.id, who: c.name, portrait: c.portrait_url, kind, line };
  }
  return null;
}

/** 🚪 You answered (or headed over): you're together in person, and she picks it up from there. */
export async function answerDropIn(userId: string, id: string): Promise<{ characterId: string; place: string; note: string; marker: string } | null> {
  const [d] = await sql()`update chat_dropins set status = 'answered' where id = ${id} and user_id = ${userId} and status = 'waiting' returning character_id, kind`;
  if (!d) return null;
  const c = await getCharacterFor(userId, String(d.character_id)).catch(() => null);
  if (!c) return null;
  const place = d.kind === "door" ? "at my front door — she came round" : `round at ${c.name}'s place, a few doors down`;
  await startInPerson(userId, c.id, place);
  return { characterId: c.id, place, note: NOTE(d.kind), marker: d.kind === "door" ? `🧍 ${c.name} came round — at the door` : `🧍 Went round to ${c.name}'s` };
}

/** 🙈 You left it. She never knows you were standing there, and nothing changes between you. */
export async function ignoreDropIn(userId: string, id: string): Promise<boolean> {
  const rows = await sql()`update chat_dropins set status = 'ignored' where id = ${id} and user_id = ${userId} and status = 'waiting' returning 1`;
  return rows.length > 0;
}

/** The note she's given while you're together after a drop-in. */
export const dropInNote = NOTE;
