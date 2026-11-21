// 👥 Group chats: the person and 2–6 characters in one thread. Each character replies as herself
// (her own personality, memory and feelings) and saves her own memory of it. Characters who didn't
// know each other meet here: they're linked automatically for this person (with how they met), start
// as acquaintances, and become friends the more they all chat together (see chat_bonds, friends.ts).
import { sql } from "./db";
import { askVelo, type Turn } from "./brain";
import { maybeRevealSecrets } from "./standing";
import { getCharacter, referenceUrls, type Character } from "./characters";
import { friendsOf, writeStory } from "./friends";
import { scrub } from "./secrets";
import type { Caller } from "./caller";
import { startMedia, type Media } from "./media";
import { allowsSuggestive } from "./traits";
import { writeText } from "./llm";
import { brainFor } from "./whichBrain";
import { sceneFallback } from "./peek";
import { myRefs } from "./picagram";
import { roomForMore } from "./together";
import { forgetLines, rewordedLine } from "./forget";
import { sceneClockNote, sceneTime, HHMM } from "./sceneClock";
import { isValidTimeZone } from "./localTime";


export type Group = { id: string; title: string; member_ids: string[]; updated_at: string; scene_title: string | null; scene_details: string | null; scene_clock?: string; scene_set_time?: string; scene_started_at?: string | null; in_person_place?: string | null; catch_up?: Record<string, string> };
export type GroupMsg = { id: string; speaker_id: string | null; content: string; created_at: string; peek?: boolean; media?: Media | null; reaction?: string | null; their_reactions?: Record<string, string>; private_to?: string | null };
const ALL = /\b(everyone|everybody|y'?all|you guys|guys|all of you|girls|ladies|both of you)\b/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listGroups(userId: string): Promise<Group[]> {
  // 📋 The chips only need a title and who's in it. `catch_up` holds every member's last twelve
  // hours of one-to-one chat — thousands of characters per person — and no screen ever reads it,
  // so it was being shipped to the phone on every single load for nothing.
  return (await sql()`select id, title, member_ids, updated_at, scene_title, scene_details, scene_clock, scene_set_time, scene_started_at::text, in_person_place from chat_groups where user_id = ${userId} order by updated_at desc limit 30`) as Group[];
}
export async function getGroup(userId: string, id: string): Promise<Group | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [g] = await sql()`select id, title, member_ids, updated_at, scene_title, scene_details, scene_clock, scene_set_time, scene_started_at::text, in_person_place, catch_up from chat_groups where id = ${id} and user_id = ${userId}`;
  return (g as Group) || null;
}
async function members(g: Group): Promise<Character[]> {
  return (await Promise.all(g.member_ids.map(id => getCharacter(id)))).filter((c): c is Character => !!c);
}

/** A new group. Anyone in it who didn't know each other meets now (for this person). */
export async function createGroup(userId: string, memberIds: string[], title: string, personName: string): Promise<Group> {
  const ids = [...new Set(memberIds.filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 6);
  const chars = (await Promise.all(ids.map(id => getCharacter(id)))).filter((c): c is Character => !!c);
  if (chars.length < 2) throw new GroupError("Pick at least 2 characters.");
  const name = title.trim().slice(0, 60) || chars.map(c => c.name).join(", ").slice(0, 60);
  const [g] = await sql()`insert into chat_groups (user_id, title, member_ids) values (${userId}, ${name}, ${chars.map(c => c.id)}::uuid[]) returning id, title, member_ids, updated_at, scene_title, scene_details, scene_clock, scene_set_time, scene_started_at::text, in_person_place, catch_up`;
  await meet(userId, chars, personName).catch(e => console.error("groups: meet", e instanceof Error ? e.message : e));
  return g as Group;
}
export class GroupError extends Error {}

/** Characters who don't both already know each other get linked for this person, with how they met. */
async function meet(userId: string, chars: Character[], personName: string) {
  const knows = new Map<string, Set<string>>();
  for (const c of chars) knows.set(c.id, new Set((await friendsOf(c)).map(f => f.id)));
  for (let i = 0; i < chars.length; i++) for (let j = i + 1; j < chars.length; j++) {
    const [x, y] = chars[i].id < chars[j].id ? [chars[i], chars[j]] : [chars[j], chars[i]];
    if (knows.get(x.id)!.has(y.id) && knows.get(y.id)!.has(x.id)) continue;
    const [had] = await sql()`select 1 from chat_bonds where user_id = ${userId} and a_id = ${x.id} and b_id = ${y.id}`;
    if (had) continue;
    const who = personName || "a mutual friend";
    const story = (await writeStory(x, y, `just met — ${who} added them both to a group chat`)) || `They met when ${who} added them both to a group chat.`;
    await sql()`insert into chat_bonds (user_id, a_id, b_id, story) values (${userId}, ${x.id}, ${y.id}, ${scrub(story).slice(0, 600)}) on conflict do nothing`;
  }
}

// 😍 Who reacted to a message, and with what. It usually arrives as an object, but can come
// back as text — and a single unreadable one must cost that message its reactions, never the
// whole chat: this used to throw, and a group that wouldn't open was the result.
function theirReactions(v: unknown): Record<string, string> {
  if (typeof v === "string") {
    try { const j = JSON.parse(v); return j && typeof j === "object" ? j as Record<string, string> : {}; }
    catch { console.error("groups: unreadable reactions on a message — showing it without them"); return {}; }
  }
  return v && typeof v === "object" ? v as Record<string, string> : {};
}

export async function groupMessages(userId: string, groupId: string, limit = 200): Promise<GroupMsg[]> {
  const rows = await sql()`select g.id, g.speaker_id, g.content, g.created_at, g.peek, g.private_to, g.reaction, g.their_reactions, md.id as media_id, md.kind as media_kind, md.status as media_status, md.description as media_description, mf.url as media_url
    from chat_group_messages g left join velo_media md on md.id = g.media_id left join velo_files mf on mf.id = md.file_id
    where g.group_id = ${groupId} and g.user_id = ${userId} order by g.created_at desc limit ${limit}`;
  return rows.reverse().map(r => ({ id: String(r.id), speaker_id: r.speaker_id ? String(r.speaker_id) : null, content: String(r.content), created_at: String(r.created_at), ...(r.peek ? { peek: true } : {}), ...(r.private_to ? { private_to: String(r.private_to) } : {}),
    reaction: r.reaction || null, their_reactions: theirReactions(r.their_reactions),
    ...(r.media_id ? { media: { id: String(r.media_id), kind: r.media_kind, status: r.media_status, url: r.media_status === "done" ? r.media_url : null, description: r.media_description || null } as Media } : {}) }));
}
const groupClock = (g: Group) => ({ clock: g.scene_clock, set_time: g.scene_set_time, started_at: g.scene_started_at || undefined });
async function userTz(userId: string): Promise<string> {
  const [u] = await sql()`select time_zone from users where id = ${userId}`;
  return isValidTimeZone(u?.time_zone) ? String(u.time_zone) : "America/Chicago";
}
/** What the characters read: never the peeks (they don't know). */
const seen = (rows: GroupMsg[]) => rows.filter(r => !r.peek);
/** 🔒 What everyone can see: no peeks and no private @texts. */
const open = (rows: GroupMsg[]) => seen(rows).filter(r => !r.private_to);
/** "@Hailey hey…" → a private text to that member (matched by her name or first name). */
export function privateTarget(text: string, chars: Character[]): { c: Character; body: string } | null {
  const m = text.match(/^\s*@([\p{L}\p{N}'’._-]+)[\s,:]+([\s\S]+)$/u);
  if (!m) return null;
  const tag = m[1].toLowerCase().replace(/[._-]+$/, "");
  const c = chars.find(x => x.name.toLowerCase() === tag || x.name.toLowerCase().split(/\s+/)[0] === tag || x.name.toLowerCase().replace(/\s+/g, "") === tag);
  return c ? { c, body: m[2].trim() } : null;
}

/** The thread as one character sees it: her own lines are hers, everyone else's carry their name. */
function turnsFor(me: string, rows: GroupMsg[], names: Map<string, string>, personName: string): Turn[] {
  const who = personName || "they";
  // 😮 Reactions travel with the thread: theirs on a character's line, and the characters' on theirs.
  const notes = (r: GroupMsg) => [
    r.reaction ? (r.speaker_id === me ? `(${who} reacted ${r.reaction} to this)` : `(${who} reacted ${r.reaction})`) : "",
    ...Object.entries(r.their_reactions || {}).map(([id, e]) => (id === me ? `(you reacted ${e} to this)` : `(${names.get(id) || "someone"} reacted ${e})`)),
  ].filter(Boolean).join(" ");
  // 🔒 Private @texts: only the one they were sent to sees them.
  return seen(rows).filter(r => !r.private_to || r.private_to === me).map(r => {
    const n = notes(r);
    const priv = r.private_to ? (r.speaker_id === me ? `(you sent this privately to ${who} — the others didn't see it)` : `(sent privately to you — the others can't see it)`) : "";
    return r.speaker_id === me
      ? { role: "assistant" as const, content: `${r.content}${n ? `\n${n}` : ""}${priv ? `\n${priv}` : ""}` }
      : { role: "user" as const, content: `[${r.speaker_id ? names.get(r.speaker_id) || "Someone" : personName || "Them"}]: ${r.content}${n ? `\n${n}` : ""}${priv ? `\n${priv}` : ""}` };
  });
}

/** 😮 They react to a character's message in the group (tap the same one again to take it back). */
export async function reactInGroup(userId: string, g: Group, msgId: string, reaction: string | null): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(msgId)) return false;
  const r = await sql()`update chat_group_messages set reaction = ${reaction} where id = ${msgId} and group_id = ${g.id} and user_id = ${userId} and speaker_id is not null returning id`;
  return r.length > 0;
}

/** Who answers: whoever they named (or everyone, for "you guys"); otherwise one or two of them, whoever's been quietest. */
function pickSpeakers(text: string, chars: Character[], rows: GroupMsg[]): Character[] {
  if (ALL.test(text)) return [...chars].sort(() => Math.random() - 0.5).slice(0, 4);
  const named = chars.map(c => ({ c, at: text.search(new RegExp(`(^|[^\\p{L}])${esc(c.name)}(?=$|[^\\p{L}])`, "iu")) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at).map(x => x.c);
  if (named.length) return named.slice(0, 3);
  const lastSpoke = (id: string) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].speaker_id === id) return i; return -1; };
  const quiet = [...chars].sort((a, b) => lastSpoke(a.id) - lastSpoke(b.id) || Math.random() - 0.5);
  return quiet.slice(0, Math.random() < 0.5 ? 2 : 1);
}

/** They said something: it's saved, then each character who answers replies in turn, seeing the others' replies. */
async function sendPrivate(caller: Caller, g: Group, chars: Character[], c: Character, body: string, timeZone: unknown, personName: string, existingId?: string): Promise<{ replies: GroupMsg[]; banter: boolean; mine: { id: string; their_reactions: Record<string, string>; private_to: string } }> {
  const [mineRow] = existingId ? [{ id: existingId }] : await sql()`insert into chat_group_messages (group_id, user_id, content, private_to) values (${g.id}, ${caller.userId}, ${body}, ${c.id}) returning id`;
  await sql()`update chat_groups set updated_at = now(), banter_left = 0 where id = ${g.id}`;
  const names = new Map(chars.map(x => [x.id, x.name]));
  const rows = await groupMessages(caller.userId, g.id, 40);
  const r = await askVelo(caller, { mode: "chat", messages: turnsFor(c.id, rows, names, personName), timeZone, name: personName, character: c, group: { others: chars.filter(x => x.id !== c.id).map(x => x.name), scene: g.scene_title ? { title: g.scene_title, details: g.scene_details || "", time: sceneClockNote(groupClock(g), await userTz(caller.userId)) } : null, inPerson: g.in_person_place ?? null, catchUp: g.catch_up?.[c.id] || "", private: true } });
  const reply = scrub(r.reply.replace(/^\s*\[[^\]]{1,40}\]:\s*/, "")).trim().slice(0, 4000);
  if (r.react) await sql()`update chat_group_messages set their_reactions = their_reactions || ${JSON.stringify({ [c.id]: r.react })}::jsonb where id = ${mineRow.id}`;
  const out: GroupMsg[] = [];
  if (reply) {
    const [m] = await sql()`insert into chat_group_messages (group_id, user_id, speaker_id, content, private_to) values (${g.id}, ${caller.userId}, ${c.id}, ${reply}, ${c.id}) returning id, speaker_id, content, created_at, private_to`;
    out.push({ ...(m as GroupMsg), private_to: c.id });
  }
  const [mine] = await sql()`select their_reactions from chat_group_messages where id = ${mineRow.id}`;
  return { replies: out, banter: false, mine: { id: String(mineRow.id), their_reactions: mine?.their_reactions || {}, private_to: c.id } };
}

export async function sendToGroup(caller: Caller, g: Group, text: string, timeZone: unknown, personName: string): Promise<{ replies: GroupMsg[]; banter: boolean; mine: { id: string; their_reactions: Record<string, string> } }> {
  const clean = scrub(text).trim().slice(0, 4000);
  if (!clean) throw new GroupError("Say something first.");
  const chars = await members(g);
  if (chars.length < 2) throw new GroupError("This group needs at least 2 characters.");
  // 🔒 "@Hailey …": a private text to her. Only she answers (privately), and nobody else ever sees either line.
  const pt = privateTarget(clean, chars);
  if (pt) return await sendPrivate(caller, g, chars, pt.c, pt.body, timeZone, personName);
  const [mineRow] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${caller.userId}, ${clean}) returning id`;
  // They spoke: any back-and-forth between the characters stops right here.
  await sql()`update chat_groups set updated_at = now(), banter_left = 0, since_banter = since_banter + 1 where id = ${g.id}`;
  return answerGroup(caller, g, chars, clean, String(mineRow.id), timeZone, personName);
}

/** Who answers their message (already saved), and their replies. */
async function answerGroup(caller: Caller, g: Group, chars: Character[], clean: string, mineId: string, timeZone: unknown, personName: string): Promise<{ replies: GroupMsg[]; banter: boolean; mine: { id: string; their_reactions: Record<string, string> } }> {
  const mineRow = { id: mineId };
  const names = new Map(chars.map(c => [c.id, c.name]));
  const out: GroupMsg[] = [];
  let rows = await groupMessages(caller.userId, g.id, 40);
  for (const c of pickSpeakers(clean, chars, open(rows))) {
    const r = await askVelo(caller, { mode: "chat", messages: turnsFor(c.id, rows, names, personName), timeZone, name: personName, character: c, group: { others: chars.filter(x => x.id !== c.id).map(x => x.name), scene: g.scene_title ? { title: g.scene_title, details: g.scene_details || "", time: sceneClockNote(groupClock(g), await userTz(caller.userId)) } : null, inPerson: g.in_person_place ?? null, catchUp: g.catch_up?.[c.id] || "" } });
    const reply = scrub(r.reply.replace(/^\s*\[[^\]]{1,40}\]:\s*/, "")).trim().slice(0, 4000);
    // 😮 Her reaction to their message: a little badge on it.
    if (r.react) await sql()`update chat_group_messages set their_reactions = their_reactions || ${JSON.stringify({ [c.id]: r.react })}::jsonb where id = ${mineRow.id}`;
    if (!reply) continue;
    const [m] = await sql()`insert into chat_group_messages (group_id, user_id, speaker_id, content) values (${g.id}, ${caller.userId}, ${c.id}, ${reply}) returning id, speaker_id, content, created_at`;
    out.push(m as GroupMsg);
    rows = [...rows, m as GroupMsg];
  }
  await closer(caller.userId, chars);
  // 💬 Every 5–10 of their messages, the characters talk among themselves for a few lines.
  const [due] = await sql()`update chat_groups set banter_left = ${2 + Math.floor(Math.random() * 3)}, since_banter = 0, banter_at = ${5 + Math.floor(Math.random() * 6)}
    where id = ${g.id} and user_id = ${caller.userId} and since_banter >= banter_at returning banter_left`;
  const [mine] = await sql()`select their_reactions from chat_group_messages where id = ${mineRow.id}`;
  return { replies: out, banter: !!due, mine: { id: String(mineRow.id), their_reactions: mine?.their_reactions || {} } };
}

/** 💬 The next line when the characters are talking among themselves (until it runs out, or the person speaks up). */
export async function banterNext(caller: Caller, g: Group, timeZone: unknown, personName: string): Promise<{ message: GroupMsg | null; more: boolean }> {
  const [left] = await sql()`update chat_groups set banter_left = banter_left - 1 where id = ${g.id} and user_id = ${caller.userId} and banter_left > 0 returning banter_left, now()::text as started`;
  if (!left) return { message: null, more: false };
  const started = String(left.started);
  const chars = await members(g);
  if (chars.length < 2) return { message: null, more: false };
  const names = new Map(chars.map(c => [c.id, c.name]));
  const rows = await groupMessages(caller.userId, g.id, 40);
  const said = open(rows);
  const last = said[said.length - 1];
  // Whoever was just spoken to answers; otherwise someone other than the last speaker.
  const others = chars.filter(c => c.id !== last?.speaker_id);
  const named = last?.speaker_id ? others.find(c => new RegExp(`(^|[^\\p{L}])${esc(c.name)}(?=$|[^\\p{L}])`, "iu").test(last.content)) : undefined;
  const c = named || others[Math.floor(Math.random() * others.length)];
  const turns = turnsFor(c.id, rows, names, personName);
  turns.push({ role: "user", content: `(The group chat goes on: ${personName || "they"} went quiet for a moment, so talk with ${chars.filter(x => x.id !== c.id).map(x => x.name).join(" and ")} — not to ${personName || "them"}.)` });
  const r = await askVelo(caller, { mode: "chat", messages: turns, timeZone, name: personName, character: c, group: { others: chars.filter(x => x.id !== c.id).map(x => x.name), scene: g.scene_title ? { title: g.scene_title, details: g.scene_details || "", time: sceneClockNote(groupClock(g), await userTz(caller.userId)) } : null, banter: true, inPerson: g.in_person_place ?? null, catchUp: g.catch_up?.[c.id] || "" } });
  const reply = scrub(r.reply.replace(/^\s*\[[^\]]{1,40}\]:\s*/, "")).trim().slice(0, 4000);
  // They may have spoken up meanwhile: then this line is dropped.
  const [spoke] = await sql()`select 1 from chat_group_messages where group_id = ${g.id} and speaker_id is null and not peek and created_at > ${started}::timestamptz limit 1`;
  const still = !spoke;
  if (!reply || !still) return { message: null, more: false };
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, speaker_id, content) values (${g.id}, ${caller.userId}, ${c.id}, ${reply}) returning id, speaker_id, content, created_at`;
  await closer(caller.userId, chars);
  return { message: m as GroupMsg, more: Number(left.banter_left) > 0 };
}

/** 🤝 Chatting together brings them closer: every message counts a little; a new day (6h+ apart) counts more. */
async function closer(userId: string, chars: Character[]) {
  for (let i = 0; i < chars.length; i++) for (let j = i + 1; j < chars.length; j++) {
    const [a, b] = chars[i].id < chars[j].id ? [chars[i].id, chars[j].id] : [chars[j].id, chars[i].id];
    await sql()`update chat_bonds set messages = messages + 1, occasions = occasions + case when last_at < now() - interval '6 hours' then 1 else 0 end, last_at = now()
      where user_id = ${userId} and a_id = ${a} and b_id = ${b}`;
  }
  // 🤫 Once two of them are really close, one may work out a secret relationship in the room.
  const out = await maybeRevealSecrets(userId, chars).catch(e => { console.error("groups: secret", e instanceof Error ? e.message : e); return []; });
  for (const o of out) console.log(`velo: ${o.knower} worked out ${o.who}'s secret`);
}

/** Each character saves her own memory of the group chat (what they shared, what she learned about the others). */
export async function rememberGroup(caller: Caller, g: Group, timeZone: unknown, personName: string): Promise<number> {
  const chars = await members(g);
  const rows = await groupMessages(caller.userId, g.id, 60);
  if (!seen(rows).some(r => !r.speaker_id)) return 0;
  const names = new Map(chars.map(c => [c.id, c.name]));
  const saved = await Promise.all(chars.map(c => askVelo(caller, { mode: "memo", messages: turnsFor(c.id, rows, names, personName), timeZone, name: personName, character: c, group: { others: chars.filter(x => x.id !== c.id).map(x => x.name) } })
    .then(r => (r.saved ? 1 : 0), e => { console.error("groups: memo", e instanceof Error ? e.message : e); return 0; })));
  return saved.reduce<number>((a, b) => a + b, 0);
}

export async function deleteGroup(userId: string, id: string): Promise<boolean> {
  const r = await sql()`delete from chat_groups where id = ${id} and user_id = ${userId} returning id`;
  return r.length > 0;
}

// 🎬 Scenes in a group: everyone's there. A marker line goes in the thread (they all read it).
export async function startGroupScene(userId: string, g: Group, kind: "live" | "past", title: string, details: string, setTime = ""): Promise<GroupMsg> {
  const t = scrub(title).trim().slice(0, 120), d = scrub(details).trim().slice(0, 1000);
  if (!t) throw new GroupError("Give the scene a title.");
  // 🧍🎥 Two times together at once is the most, this meet-up included.
  if (kind === "live") {
    const full = await roomForMore(userId, g.title).catch(() => null);
    if (full) throw new GroupError(full);
  }
  const marker = kind === "live" ? `🎥 Group video chat: ${t}${d ? ` — ${d}` : ""}` : `🎬 Something we all did together: ${t}${d ? ` — ${d}` : ""}`;
  const at = HHMM.test(setTime) ? setTime : "";
  if (kind === "live") await sql()`update chat_groups set in_person_place = null, catch_up = '{}'::jsonb, scene_title = ${t}, scene_details = ${d}, scene_clock = ${at ? "set" : "now"}, scene_set_time = ${at}, scene_started_at = now(), updated_at = now() where id = ${g.id} and user_id = ${userId}`;
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${marker}) returning id, speaker_id, content, created_at`;
  return { ...(m as GroupMsg), speaker_id: null };
}
export async function endGroupScene(userId: string, g: Group): Promise<GroupMsg | null> {
  if (!g.scene_title) return null;
  await sql()`update chat_groups set scene_title = null, scene_details = null where id = ${g.id} and user_id = ${userId}`;
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${`🎥 Video chat ended: ${g.scene_title}`}) returning id, speaker_id, content, created_at`;
  return { ...(m as GroupMsg), speaker_id: null };
}

// 👀 Peeks in a group scene: a photo of the moment with the characters they pick (one or more). Nobody knows.
const romanticFor = (c: Character, adult: boolean) => adult && !!c.romantic && allowsSuggestive(c.traits);
async function pickedMembers(g: Group, ids: string[]): Promise<Character[]> {
  const want = ids.filter(id => g.member_ids.includes(id));
  const chars = (await members(g)).filter(c => want.includes(c.id));
  if (!chars.length) throw new GroupError("Pick who's in the picture.");
  return chars;
}
export async function draftGroupPeek(userId: string, g0: Group, ids: string[], adult: boolean, personName: string, writer?: string): Promise<string> {
  if (!g0.scene_title && g0.in_person_place == null) throw new GroupError("Peeks are for scenes or when you're together in person — start one first.");
  // 🧍 Together in person: the "scene" is just hanging out where you are, right now.
  const g = g0.scene_title ? g0 : { ...g0, scene_title: "Hanging out together in person", scene_details: g0.in_person_place || "", scene_clock: "now" };
  const chars = await pickedMembers(g, ids), all = await members(g);
  const names = new Map(all.map(c => [c.id, c.name]));
  const rows = await groupMessages(userId, g.id, 120);
  const lastPeek = [...rows].reverse().find(r => r.peek && r.media?.status === "done")?.media?.description || "";
  const lastIdx = rows.map(r => !!(r.peek && r.media)).lastIndexOf(true);
  const transcript = rows.filter((r, i) => (!r.peek || i === lastIdx) && !r.private_to).map(r => (r.peek ? "— (your last peek was here) —" : `${r.speaker_id ? names.get(r.speaker_id) || "Someone" : personName || "Them"}: ${r.content}`)).join("\n");
  const who = chars.map(c => c.name).join(" and ");
  const romantic = chars.every(c => romanticFor(c, adult));
  const raw = await writeText(writer ?? await brainFor(userId), `You write the description for ONE photo for an image generator. The person is on a group VIDEO CHAT (below) and this is what they see of ${who} on their screen right now — wherever each of them is: the person is not in the picture. Show ONLY ${who}${chars.length < all.length ? ` (not ${all.filter(c => !chars.some(x => x.id === c.id)).map(c => c.name).join(" or ")})` : ""}. Describe the place (time of day, lighting), what each of them is wearing, what each is doing, their poses and expressions — candid and unaware, or glancing at the camera.
OUTFIT CONTINUITY: each of them wears ONE outfit for the whole scene. ${lastPeek ? "Start from what they wore in THE LAST PEEK" : "Start from the outfits in the scene's details or what they said they're wearing (else what fits the outing and their usual style)"}, then apply only the changes that actually happened, in order (a jacket taken off stays off until it's put back on, and so on). Keep every other detail identical. The same goes for the place.
${chars.every(c => c.explicit_ok) && romantic ? "Nudity is fine when it fits." : romantic ? "Flattering and flirty is fine; swimwear at the beach or pool is okay; no nudity or lingerie." : "Family-friendly, fully clothed."} Two or three sentences, under 380 characters, no names of real people, output only the description.`, `SCENE: ${g.scene_title}${g.scene_details ? ` — ${g.scene_details}` : ""}\nTIME IN THE SCENE: ${sceneTime(groupClock(g), await userTz(userId)).label} (match the light and sky to it)\n${chars.map(c => `${c.name.toUpperCase()}'S LOOK: ${c.appearance || "(see reference pictures)"}${c.casual_wear ? `; usual style: ${c.casual_wear}` : ""}`).join("\n")}${lastPeek ? `\nTHE LAST PEEK: ${lastPeek}` : ""}\n\nTHE SCENE SO FAR:\n${(transcript.length > 12000 ? "…" + transcript.slice(-12000) : transcript) || "(it just started)"}`, 350);
  const text = raw.replace(/\s+/g, " ").trim();
  return text.slice(0, 400) || sceneFallback(who, g.scene_title || "", g.scene_details || "", sceneTime(groupClock(g), await userTz(userId)).label, lastPeek);
}
/**
 * 📸 A photo in a group chat — not a peek. You pick who's in it (up to three faces, counting
 * yourself), and the description is yours: blank to begin with, written for you if you ask, or
 * typed from scratch. What the box says is what the picture service is given.
 *
 * 🧍 Where they are depends on the group. Together in person, it's all of them in that one place
 * right now. Otherwise they are apart, each in her own town and her own day — so a picture of
 * two of them together can only be one from a day they actually spent together, and a picture of
 * one of them is wherever she is now, dressed for it. The draft is told which of the two it is.
 */
const photoCast = async (userId: string, g: Group, ids: string[], withMe: boolean) => {
  const chars = await pickedMembers(g, ids);
  if (!chars.length && !withMe) throw new GroupError("Pick who's in the picture.");
  if (chars.length + (withMe ? 1 : 0) > 3) throw new GroupError("Three in a picture at most — you and two of them, or three of them.");
  return chars;
};
/** 🧭 How the photo has to make sense for this group, told to whoever writes it. */
const whereThey = (g: Group, chars: Character[]) => g.in_person_place != null
  ? `THEY ARE ALL TOGETHER IN PERSON right now${g.in_person_place ? `, at ${g.in_person_place}` : ""} — so this is a photo of them there, together, as things are now.`
  : `THEY ARE NOT TOGETHER. ${chars.map(c => `${c.name} is at home in ${c.lives_in || "her own town"}`).join("; ")}. Each of them is somewhere of her own right now, so either:
 • a photo of ONE of them where she is at the moment, in what she'd really be wearing for it, or
 • an older photo from a day they WERE together — say so in the description ("a photo from…"), and dress them for that day, not today.
Never put two of them in the same room as if it were happening now.`;

export async function draftGroupPhoto(userId: string, g: Group, ids: string[], withMe: boolean, about: string, adult: boolean, personName: string, writer?: string): Promise<string> {
  const chars = await photoCast(userId, g, ids, withMe);
  const rows = await groupMessages(userId, g.id, 40);
  const names = new Map((await members(g)).map(c => [c.id, c.name]));
  const talk = rows.filter(r => !r.peek && !r.private_to).slice(-14)
    .map(r => `${r.speaker_id ? names.get(r.speaker_id) || "Someone" : personName || "Them"}: ${String(r.content).replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
  const romantic = chars.every(c => romanticFor(c, adult));
  const who = [...chars.map(c => `${c.name} — ${c.appearance || "as she looks"}${c.casual_wear ? `, usually in ${c.casual_wear}` : ""}${c.job ? `, works as ${c.job}` : ""}`),
    ...(withMe ? [`${personName || "them"} — the person whose group this is, in it too`] : [])].join("\n");
  const raw = await writeText(writer ?? await brainFor(userId), `You write the description for ONE photo for an image generator, for a group chat.
WHO IS IN IT (nobody else):\n${who}
${whereThey(g, chars)}
${chars.every(c => c.explicit_ok) && romantic ? "Nudity is fine when it fits." : romantic ? "Flattering and flirty is fine; swimwear at the beach or pool is okay; no nudity or lingerie." : "Family-friendly, fully clothed."}
Two or three sentences, under 380 characters: where it is, what they're wearing, what they're doing, the light. No names of real people, no brands. Write only the description.`,
    `${about.trim() ? `WHAT THEY ASKED FOR: ${scrub(about).replace(/\s+/g, " ").slice(0, 300)}\n\n` : ""}THE CHAT SO FAR:\n${talk}`, 500).catch(() => "");
  const desc = scrub(raw.replace(/^```(json)?|```$/g, "").replace(/\s+/g, " ").trim()).slice(0, 1500);
  if (!desc) throw new GroupError("Couldn't write one just now — write it yourself, or try again.");
  return desc;
}

/** 📸 Make it, and put it in the group where everyone can see it (a peek is the hidden one). */
export async function groupPhoto(userId: string, g: Group, ids: string[], withMe: boolean, adult: boolean, description: string, personName = ""): Promise<GroupMsg[]> {
  const chars = await photoCast(userId, g, ids, withMe);
  const desc = scrub(description.replace(/\s+/g, " ").trim()).slice(0, 1500);
  if (desc.length < 10) throw new GroupError("Describe the picture a little more.");
  // 👥 The first one in the picture is the main subject, and `startMedia` puts her at the head of
  // the cast itself — so what goes in `people` is everyone ELSE. Handing it the whole cast put her
  // in twice: her face took two of the four reference slots, the last person's references were
  // squeezed out altogether, and the note telling the model who is who read "Carol, Carol, Jen".
  const [first, ...rest] = chars;
  const others = [
    ...(await Promise.all(rest.map(async c => ({ name: c.name, refs: await referenceUrls(c), appearance: c.appearance })))),
    // 🙋 You, when you're in it — unless you're the only one, and then you're the subject below.
    ...(withMe && first ? [{ name: personName || "you", refs: await myRefs(userId), appearance: "" }] : []),
  ];
  const media = await startMedia(userId, { kind: "image", with_me: withMe, they_asked: true, description: desc },
    { characterId: first?.id || null, who: first?.name || personName || "you", appearance: first?.appearance || "",
      refs: first ? await referenceUrls(first) : await myRefs(userId),
      romantic: chars.every(c => romanticFor(c, adult)), offer: false, other: null, raw: true, people: others.length ? others : undefined });
  const caption = `📸 ${[...chars.map(c => c.name), ...(withMe ? [personName || "me"] : [])].join(", ")}`;
  const [row] = await sql()`insert into chat_group_messages (group_id, user_id, content, media_id) values (${g.id}, ${userId}, ${caption}, ${media.id}) returning id, speaker_id, content, created_at`;
  return [{ ...(row as GroupMsg), speaker_id: null, media }];
}

export async function groupPeekAt(userId: string, g: Group, ids: string[], adult: boolean, description: string): Promise<GroupMsg[]> {
  if (!g.scene_title && g.in_person_place == null) throw new GroupError("Peeks are for scenes or when you're together in person — start one first.");
  const chars = await pickedMembers(g, ids);
  const desc = scrub(description.replace(/\s+/g, " ").trim()).slice(0, 1500);
  if (desc.length < 10) throw new GroupError("Describe the picture a little more.");
  const [first, ...rest] = chars;
  const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: desc },
    { characterId: first.id, who: first.name, appearance: first.appearance, refs: await referenceUrls(first), romantic: chars.every(c => romanticFor(c, adult)), offer: false, other: null, peek: true, raw: true,
      people: await Promise.all(rest.map(async c => ({ name: c.name, refs: await referenceUrls(c), appearance: c.appearance }))) });
  const [mine] = await sql()`insert into chat_group_messages (group_id, user_id, content, peek) values (${g.id}, ${userId}, '*peek*', true) returning id, speaker_id, content, created_at`;
  const [pic] = await sql()`insert into chat_group_messages (group_id, user_id, content, peek, media_id, created_at) values (${g.id}, ${userId}, ${`(peek: ${chars.map(c => c.name).join(", ")})`}, true, ${media.id}, now() + interval '5 milliseconds') returning id, speaker_id, content, created_at`;
  return [{ ...(mine as GroupMsg), speaker_id: null, peek: true }, { ...(pic as GroupMsg), speaker_id: null, peek: true, media }];
}

// 🧍 Bringing people together: you're with one character in person (or texting them), and bring others along.
// The group (the same people's existing group, or a new one) goes "in person" at that place, and each of
// them carries over their recent one-on-one with you, so everyone picks up right where they left off.
export async function bringTogether(userId: string, fromId: string, otherIds: string[], place: string, personName: string): Promise<Group> {
  const ids = [...new Set([fromId, ...otherIds.filter(x => /^[0-9a-f-]{36}$/i.test(x))])].slice(0, 6);
  const chars = (await Promise.all(ids.map(id => getCharacter(id)))).filter((c): c is Character => !!c);
  if (chars.length < 2) throw new GroupError("Pick who you're bringing.");
  const sorted = chars.map(c => c.id).sort();
  const [same] = await sql()`select id from chat_groups where user_id = ${userId} and member_ids @> ${sorted}::uuid[] and member_ids <@ ${sorted}::uuid[] order by updated_at desc limit 1`;
  const g = same ? (await getGroup(userId, String(same.id)))! : await createGroup(userId, chars.map(c => c.id), "", personName);
  const catchUp: Record<string, string> = {};
  for (const c of chars) {
    const rows = (await sql()`select role, content from velo_messages where user_id = ${userId} and character_id = ${c.id} and not peek and media_id is null
      and created_at > now() - interval '12 hours' order by created_at desc limit 16`).reverse();
    const text = rows.map(r => `${r.role === "assistant" ? c.name : personName || "Them"}: ${String(r.content).replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
    if (text) catchUp[c.id] = scrub(text).slice(-3000);
  }
  const where = scrub(place).replace(/\s+/g, " ").trim().slice(0, 120);
  await sql()`update chat_groups set in_person_place = ${where}, catch_up = ${JSON.stringify(catchUp)}::jsonb, scene_title = null, scene_details = null, updated_at = now() where id = ${g.id} and user_id = ${userId}`;
  const names = chars.map(c => c.name);
  await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${`🧍 Together in person${where ? ` — ${where}` : ""}: ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`})`;
  // Their one-on-one chats move over: in-person there ends, with a note.
  for (const c of chars) {
    const ended = await sql()`update chat_in_person set ended_at = now() where user_id = ${userId} and character_id = ${c.id} and ended_at is null returning 1`;
    const with_ = names.filter(n => n !== c.name).join(" and ");
    await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'user', ${`🧍 ${ended.length ? "We met up" : "I came over"} with ${with_}${where ? ` — ${where}` : ""} (continued in our group)`}, ${c.id})`;
  }
  return (await getGroup(userId, g.id))!;
}
export async function endGroupInPerson(userId: string, g: Group): Promise<GroupMsg | null> {
  if (g.in_person_place == null) return null;
  await sql()`update chat_groups set in_person_place = null, catch_up = '{}'::jsonb where id = ${g.id} and user_id = ${userId}`;
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, '🧍 Everyone went their separate ways') returning id, speaker_id, content, created_at`;
  return { ...(m as GroupMsg), speaker_id: null };
}

// 🗑 Deleting up to 10 messages in a group: gone from the thread, and each character forgets what she
// learned only from the ones she could see. If their own message is now the latest, it gets answered again.
/** ✏️ Reword a line in a group — yours or one of theirs. The text is simply replaced; everyone
 *  there carries on from what it says now, and anything written down from the old wording is put
 *  right, for the ones who could actually see it. */
export async function editGroupMessage(caller: Caller, g: Group, id: string, text: string, personName: string): Promise<{ id: string; content: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // Pictures and peeks aren't words, so there is nothing to reword in them.
  const [was] = await sql()`select speaker_id, content, created_at::text as at, private_to from chat_group_messages
    where id = ${id} and group_id = ${g.id} and user_id = ${caller.userId} and media_id is null and not peek`;
  if (!was) return null;
  // 🎬 The scene notes aren't anybody's words either.
  if (!was.speaker_id && /^(🎬|🎥|🧍)/.test(String(was.content))) return null;
  const [row] = await sql()`update chat_group_messages set content = ${text}
    where id = ${id} and group_id = ${g.id} and user_id = ${caller.userId} returning id, content`;
  if (!row) return null;
  if (String(was.content) !== text) {
    const chars = await members(g);
    const who = was.speaker_id ? chars.find(c => c.id === String(was.speaker_id))?.name || "Someone" : personName || "Them";
    const brain = await brainFor(caller.userId);
    // 🔒 A private @text was between the two of you: nobody else wrote anything down from it.
    for (const c of chars) {
      if (was.private_to && String(was.private_to) !== c.id) continue;
      await rewordedLine(caller.userId, c.id, who, String(was.content), text, String(was.at), brain)
        .catch(e => console.error("groups: reworded", e instanceof Error ? e.message : e));
    }
  }
  return { id: String(row.id), content: String(row.content) };
}

export async function deleteGroupMessages(caller: Caller, g: Group, ids: string[], timeZone: unknown, personName: string): Promise<{ deleted: number; replies: GroupMsg[] }> {
  const want = [...new Set(ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 10);
  if (!want.length) return { deleted: 0, replies: [] };
  const gone = await sql()`delete from chat_group_messages where group_id = ${g.id} and user_id = ${caller.userId} and id = any(${want}::uuid[])
    returning speaker_id, content, created_at::text, peek, private_to`;
  if (!gone.length) return { deleted: 0, replies: [] };
  const chars = await members(g);
  const names = new Map(chars.map(c => [c.id, c.name]));
  for (const c of chars) {
    const mine = gone.filter(r => !r.peek && (!r.private_to || String(r.private_to) === c.id));
    if (!mine.length) continue;
    const lines = mine.map(r => `${r.speaker_id ? names.get(String(r.speaker_id)) || "Someone" : personName || "Them"}: ${String(r.content).slice(0, 600)}`).join("\n");
    await forgetLines(caller.userId, c.id, lines, mine.map(r => String(r.created_at)).sort()[0], await brainFor(caller.userId)).catch(e => console.error("groups: forget", e instanceof Error ? e.message : e));
  }
  // Their message is now the last thing said: it gets answered again.
  const rows = seen(await groupMessages(caller.userId, g.id, 5));
  const last = rows[rows.length - 1];
  let replies: GroupMsg[] = [];
  if (last && !last.speaker_id && !last.content.startsWith("🎬") && !last.content.startsWith("🎥") && !last.content.startsWith("🧍") && chars.length >= 2) {
    const to = last.private_to ? chars.find(c => c.id === last.private_to) : null;
    replies = (to ? await sendPrivate(caller, g, chars, to, last.content, timeZone, personName, last.id) : await answerGroup(caller, g, chars, last.content, last.id, timeZone, personName)).replies;
  }
  return { deleted: gone.length, replies };
}
