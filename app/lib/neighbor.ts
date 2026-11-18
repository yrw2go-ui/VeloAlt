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
import { sendPush } from "./push";
import { isSecret, standingOf } from "./standing";
import { bringTogether } from "./groups";
import { setLink } from "./friends";

export type Kind = "door" | "back" | "over";
export type DropIn = { id: string; characterId: string; who: string; portrait: string | null; kind: Kind; line: string; hosting: { id: string; name: string } | null; away: { name: string } | null };

/** What her card says about living on your street, so she lives it rather than announcing it. */
export const NEIGHBOR_NOTE = `🏘️ YOU'RE THEIR NEIGHBOUR — you live a few doors down on the same street, and you both know it. You see their car come and go, you pass the house, you run into each other outside. You can say so naturally ("saw your light on", "I'm two minutes away"), pop round, or ask them over, the way neighbours do — never as a big announcement.`;

/** Her line when she's actually at the door, or asking you over. */
const NOTE = (kind: Kind) => kind === "back"
  ? `🚪 YOU'RE AT THEIR BACK DOOR RIGHT NOW — what the two of you have is nobody else's business, so you came round the back where nobody sees you, quietly, and they've just let you in. Talk face to face, present tense, and keep your voice down. Don't text-talk, and don't act surprised to be there.`
  : kind === "door"
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

/** 👥 Whoever you already have round: answering the door with her here can mean they meet. */
export async function hostingNow(userId: string, except?: string): Promise<{ id: string; name: string } | null> {
  const [r] = await sql()`select c.id, c.name from chat_in_person p join chat_characters c on c.id = p.character_id
    where p.user_id = ${userId} and p.ended_at is null and (${except || null}::uuid is null or p.character_id <> ${except || null}::uuid)
    order by p.started_at desc limit 1`;
  return r ? { id: String(r.id), name: String(r.name) } : null;
}

/** 🚶 Out at someone else's place right now: you're not home to answer your own door. */
export async function outAtTheirs(userId: string): Promise<{ id: string; name: string; place: string } | null> {
  const [r] = await sql()`select c.id, c.name, p.place from chat_in_person p join chat_characters c on c.id = p.character_id
    where p.user_id = ${userId} and p.ended_at is null and not p.at_mine order by p.started_at desc limit 1`;
  return r ? { id: String(r.id), name: String(r.name), place: String(r.place || "") } : null;
}

/** Anyone standing there right now (the popup reads this). */
export async function waitingDropIn(userId: string): Promise<DropIn | null> {
  const [r] = await sql()`select d.id, d.character_id, d.kind, d.line, c.name, f.url as portrait
    from chat_dropins d join chat_characters c on c.id = d.character_id left join velo_files f on f.id = c.portrait_file_id
    where d.user_id = ${userId} and d.status = 'waiting' and d.created_at > now() - interval '20 minutes'
    order by d.created_at desc limit 1`;
  if (!r) return null;
  const out = await outAtTheirs(userId);
  return { id: String(r.id), characterId: String(r.character_id), who: String(r.name), portrait: r.portrait ? String(r.portrait) : null, kind: r.kind, line: String(r.line),
    hosting: out ? null : await hostingNow(userId, String(r.character_id)), away: out && out.id !== String(r.character_id) ? { name: out.name } : null };
}

/** 🙋 You asked her over in the last few hours — then she can turn up whether or not you're close. */
const ASKED = /\b(come (over|round|by)|pop (over|round|by)|stop by|swing by|head over|come see me|you should come)\b/i;
async function invited(userId: string, characterId: string): Promise<boolean> {
  const rows = await sql()`select content from velo_messages where user_id = ${userId} and character_id = ${characterId}
    and role = 'user' and created_at > now() - interval '3 hours' order by created_at desc limit 20`;
  return rows.some(r => ASKED.test(String(r.content || "")));
}

/** Close enough to just turn up: someone you're genuinely in each other's lives with. */
export async function closeEnough(userId: string, c: Character): Promise<boolean> {
  const happy = await happyFor(userId, c).catch(() => 60);
  const trust = await trustFor(userId, c).catch(() => null);
  const love = await loveFor(userId, c, !!c.romantic).catch(() => null);
  return happy >= 70 || (trust ?? 0) >= 65 || (love ?? 0) >= 55;
}

/** A decent hour where she is (she's up until about 1am), and she isn't at work, in class, away or poorly. */
export async function free(userId: string, c: Character): Promise<boolean> {
  const tz = isValidTimeZone(c.time_zone) ? c.time_zone : "America/Chicago";
  const { hour } = zonedParts(Date.now(), tz);
  if (hour >= 1 && hour < 9) return false; // between 1am and 9am nobody's knocking
  if (workNow(c, tz, Date.now(), await offToday(userId, c.id, tz).catch(() => false), c.id).atWork) return false;
  if (await awayFor(userId, c.id).catch(() => null)) return false;
  if (await sickFor(userId, c.id).catch(() => null)) return false;
  if (await soreFor(userId, c.id).catch(() => null)) return false; // 💔 not while something's still sitting with her
  return true;
}

const LINES: Record<Kind, string[]> = {
  door: ["*knock knock* hey — you busy?", "hey, saw your light on. Thought I'd come say hi 🙂", "*knocks* it's only me — I was two doors away, so."],
  back: ["I'm round the back 🤫 let me in?", "*taps the back door, quietly* it's me. Open up before someone sees me.", "came round the back. Nobody saw me — are you going to leave me out here?"],
  over: ["saw your car outside — come over for a bit? 🙂", "you're home! Come round, I've got the kettle on.", "spotted your car. Come over, I'm bored out of my mind."],
};

/** Her own words for turning up — hers if her brain answers, otherwise something plain and true. */
async function knockLine(c: Character, kind: Kind, name: string): Promise<string> {
  const plain = LINES[kind][Math.floor(Math.random() * LINES[kind].length)];
  const raw = await writeText(c.brain, `You are ${c.name}. ${c.personality || ""}
You live a few doors down from ${name || "them"}. ${kind === "back" ? "What the two of you have is a secret, so you've come round to their BACK door where nobody sees you, and you're letting them know you're there — quietly." : kind === "door" ? "You've just walked down and knocked on their door — they haven't opened it yet." : "You've seen their car outside, so you're messaging to ask them over to yours."} Write ONE short line in your own voice, the way you'd really say it — under 120 characters, no quotes, no name sign-off. Just the line.`,
    kind === "over" ? "You're asking them over." : "You're standing at their door.", 60, { ms: 8_000 }).catch(() => "");
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
      and not exists (select 1 from chat_dropins d where d.character_id = c.id and d.created_at > now() - interval '6 hours')
      and not exists (select 1 from chat_in_person p where p.user_id = ${userId} and p.character_id = c.id and p.ended_at is null)`;
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
    // 🤫 Kept quiet: she doesn't stand on the front step where the street can see her.
    const secret = isSecret(standingOf(c));
    const kind: Kind = secret ? (Math.random() < 0.8 ? "back" : "over") : Math.random() < 0.6 ? "door" : "over";
    const line = await knockLine(c, kind, String(u?.name || ""));
    const [row] = await sql()`insert into chat_dropins (user_id, character_id, kind, line) values (${userId}, ${c.id}, ${kind}, ${line.slice(0, 300)}) returning id`;
    const out = await outAtTheirs(userId);
    return { id: String(row.id), characterId: c.id, who: c.name, portrait: c.portrait_url, kind, line,
      hosting: out ? null : await hostingNow(userId, c.id), away: out && out.id !== c.id ? { name: out.name } : null };
  }
  return null;
}

/** 🚪 You answered (or headed over): you're together in person, and she picks it up from there. */
export async function answerDropIn(userId: string, id: string, meetChance = 0.2): Promise<{ characterId: string; groupId?: string; place: string; note: string; marker: string; met?: { who: string; knewEachOther: boolean } } | null> {
  const [d] = await sql()`update chat_dropins set status = 'answered' where id = ${id} and user_id = ${userId} and status = 'waiting' returning character_id, kind`;
  if (!d) return null;
  const c = await getCharacterFor(userId, String(d.character_id)).catch(() => null);
  if (!c) return null;
  const kind = d.kind as Kind;
  const doorway = kind === "back" ? "at my back door" : "at my front door";
  const place = kind === "over" ? `round at ${c.name}'s place, a few doors down` : `${doorway} — she came round`;
  const marker = kind === "over" ? `🧍 Went round to ${c.name}'s` : `🧍 ${c.name} came round — ${doorway}`;
  // 👥 Someone's already here. Now and then opening that door means the two of them meet.
  const host = kind === "over" ? null : await hostingNow(userId, c.id);
  if (host && Math.random() < meetChance) {
    const knewEachOther = await alreadyKnow(c.id, host.id);
    const where = `at mine — ${c.name} turned up ${doorway} while ${host.name} was here`;
    const [u] = await sql()`select name from users where id = ${userId}`;
    const g = await bringTogether(userId, c.id, [host.id], where, String(u?.name || "")).catch(() => null);
    if (g) {
      await metAtTheDoor(c.id, host.id, c.name, host.name, knewEachOther);
      await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${
        knewEachOther
          ? `🧍 (${c.name} and ${host.name} already know each other — and here they both are.)`
          : `🧍 (${c.name} and ${host.name} have never met before. They're meeting right now, in the doorway.)`})`;
      return { characterId: c.id, groupId: g.id, place: where, note: NOTE(kind), marker, met: { who: host.name, knewEachOther } };
    }
  }
  // 🚪 She came to yours, or you went round to hers: it decides whether you're home to answer a knock.
  await startInPerson(userId, c.id, place, kind !== "over");
  return { characterId: c.id, place, note: NOTE(kind), marker };
}

/** Have these two ever been introduced? */
async function alreadyKnow(a: string, b: string): Promise<boolean> {
  const rows = await sql()`select 1 from chat_character_links where (knower_id = ${a} and known_id = ${b}) or (knower_id = ${b} and known_id = ${a}) limit 1`;
  return rows.length > 0;
}

/** They've met now, and they both keep it: a link each way, unless they already had one. */
async function metAtTheDoor(a: string, b: string, aName: string, bName: string, knewEachOther: boolean) {
  if (knewEachOther) return; // what they already are to each other stands
  const story = "met at the door when one of them turned up while the other was round";
  await setLink(a, b, "met", `You met ${bName} ${story}.`).catch(() => {});
  await setLink(b, a, "met", `You met ${aName} ${story}.`).catch(() => {});
}

/** 🙈 You left it. She never knows you were standing there, and nothing changes between you. */
export async function ignoreDropIn(userId: string, id: string): Promise<boolean> {
  const rows = await sql()`update chat_dropins set status = 'ignored' where id = ${id} and user_id = ${userId} and status = 'waiting' returning character_id`;
  if (!rows.length) return false;
  // 🚶 You were round at someone else's, so you couldn't have answered: she texts to say she called by.
  if (await outAtTheirs(userId).catch(() => null)) await stoppedBy(userId, String(rows[0].character_id)).catch(e => console.error("neighbor: stopped by", e instanceof Error ? e.message : e));
  return true;
}

/** 📩 "I stopped by" — her own words, a few minutes after nobody came to the door. */
export async function stoppedBy(userId: string, characterId: string): Promise<void> {
  const c = await getCharacterFor(userId, characterId).catch(() => null);
  if (!c) return;
  const [u] = await sql()`select name from users where id = ${userId}`;
  const plain = ["knocked just now — car's there so I know you're about! No rush, catch you later 🙂",
    "stopped by, no answer. Saw your car so I'll assume you're busy — no worries x",
    "came by earlier! Your car's out front so I know you're around somewhere. Shout when you're free."];
  const raw = await writeText(c.brain, `You are ${c.name}. ${c.personality || ""}
You live a few doors down from ${String(u?.name || "them")}. You knocked just now and nobody came to the door — but their car is parked outside, so you know they're around here somewhere and simply couldn't come to the door. You're texting to say you called by: warm and completely understanding, no sulking, no pressure, no interrogating them about where they were. You do NOT know where they are and you never guess out loud. Write ONE short text in your own voice, under 140 characters, no quotes, no sign-off. Just the text.`,
    "You called round, their car is there, and they didn't come to the door.", 70, { ms: 8_000 }).catch(() => "");
  const line = scrub(raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim()).slice(0, 200) || plain[Math.floor(Math.random() * plain.length)];
  await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'assistant', ${line}, ${characterId})`;
  await sendPush(userId, { title: c.name, body: line.slice(0, 170), url: `/?chat=${characterId}`, icon: c.portrait_url || "/icon-192.png", tag: `chat-${characterId}` }).catch(() => {});
}

/** The note she's given while you're together after a drop-in. */
export const dropInNote = NOTE;
