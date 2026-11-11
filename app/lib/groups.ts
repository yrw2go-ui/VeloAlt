// 👥 Group chats: the person and 2–6 characters in one thread. Each character replies as herself
// (her own personality, memory and feelings) and saves her own memory of it. Characters who didn't
// know each other meet here: they're linked automatically for this person (with how they met), start
// as acquaintances, and become friends the more they all chat together (see chat_bonds, friends.ts).
import { sql } from "./db";
import { askVelo, type Turn } from "./brain";
import { getCharacter, referenceUrls, type Character } from "./characters";
import { friendsOf, writeStory } from "./friends";
import { scrub } from "./secrets";
import type { Caller } from "./caller";
import { startMedia, type Media } from "./media";
import { allowsSuggestive } from "./traits";
import { writeText } from "./llm";
import { sceneFallback } from "./peek";
import { sceneClockNote, sceneTime, HHMM } from "./sceneClock";
import { isValidTimeZone } from "./localTime";


export type Group = { id: string; title: string; member_ids: string[]; updated_at: string; scene_title: string | null; scene_details: string | null; scene_clock?: string; scene_set_time?: string; scene_started_at?: string | null; in_person_place?: string | null; catch_up?: Record<string, string> };
export type GroupMsg = { id: string; speaker_id: string | null; content: string; created_at: string; peek?: boolean; media?: Media | null; reaction?: string | null; their_reactions?: Record<string, string>; private_to?: string | null };
const ALL = /\b(everyone|everybody|y'?all|you guys|guys|all of you|girls|ladies|both of you)\b/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listGroups(userId: string): Promise<Group[]> {
  try {
    return (await sql()`select id, title, member_ids, updated_at, scene_title, scene_details, scene_clock, scene_set_time, scene_started_at::text, in_person_place, catch_up from chat_groups where user_id = ${userId} order by updated_at desc limit 30`) as Group[];
  } catch {
    // Column may not exist yet — fall back without it.
    return (await sql()`select id, title, member_ids, updated_at, scene_title, scene_details, scene_clock, scene_set_time, scene_started_at::text from chat_groups where user_id = ${userId} order by updated_at desc limit 30`) as Group[];
  }
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

export async function groupMessages(userId: string, groupId: string, limit = 200): Promise<GroupMsg[]> {
  const rows = await sql()`select g.id, g.speaker_id, g.content, g.created_at, g.peek, g.reaction, g.their_reactions, md.id as media_id, md.kind as media_kind, md.status as media_status, md.description as media_description, mf.url as media_url
    from chat_group_messages g left join velo_media md on md.id = g.media_id left join velo_files mf on mf.id = md.file_id
    where g.group_id = ${groupId} and g.user_id = ${userId} order by g.created_at desc limit ${limit}`;
  return rows.reverse().map(r => ({ id: String(r.id), speaker_id: r.speaker_id ? String(r.speaker_id) : null, content: String(r.content), created_at: String(r.created_at), ...(r.peek ? { peek: true } : {}),
    reaction: r.reaction || null, their_reactions: r.their_reactions && typeof r.their_reactions === "object" ? r.their_reactions : {},
    ...(r.media_id ? { media: { id: String(r.media_id), kind: r.media_kind, status: r.media_status, url: r.media_status === "done" ? r.media_url : null, description: r.media_description || null } as Media } : {}) }));
}
const groupClock = (g: Group) => ({ clock: g.scene_clock, set_time: g.scene_set_time, started_at: g.scene_started_at || undefined });
async function userTz(userId: string): Promise<string> {
  const [u] = await sql()`select time_zone from users where id = ${userId}`;
  return isValidTimeZone(u?.time_zone) ? String(u.time_zone) : "America/Chicago";
}
/** What the characters read: never the peeks (they don't know). */
const seen = (rows: GroupMsg[]) => rows.filter(r => !r.peek);

/** The thread as one character sees it: her own lines are hers, everyone else's carry their name. */
function turnsFor(me: string, rows: GroupMsg[], names: Map<string, string>, personName: string): Turn[] {
  const who = personName || "they";
  // 😮 Reactions travel with the thread: theirs on a character's line, and the characters' on theirs.
  const notes = (r: GroupMsg) => [
    r.reaction ? (r.speaker_id === me ? `(${who} reacted ${r.reaction} to this)` : `(${who} reacted ${r.reaction})`) : "",
    ...Object.entries(r.their_reactions || {}).map(([id, e]) => (id === me ? `(you reacted ${e} to this)` : `(${names.get(id) || "someone"} reacted ${e})`)),
  ].filter(Boolean).join(" ");
  return seen(rows).map(r => {
    const n = notes(r);
    return r.speaker_id === me
      ? { role: "assistant" as const, content: `${r.content}${n ? `\n${n}` : ""}` }
      : { role: "user" as const, content: `[${r.speaker_id ? names.get(r.speaker_id) || "Someone" : personName || "Them"}]: ${r.content}${n ? `\n${n}` : ""}` };
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
async function sendPrivate(caller: Caller, g: Group, chars: Character[], c: Character, body: string, timeZone: unknown, personName: string): Promise<{ replies: GroupMsg[]; banter: boolean; mine: { id: string; their_reactions: Record<string, string>; private_to: string } }> {
  const [mineRow] = await sql()`insert into chat_group_messages (group_id, user_id, content, private_to) values (${g.id}, ${caller.userId}, ${body}, ${c.id}) returning id`;
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

export async function sendToGroup(caller: Caller, g: Group, text: string, timeZone: unknown, personName: string): Promise<{ replies: GroupMsg[]; banter: boolean; mine: { id: string; their_reactions: Record<string, string>; private_to?: string } }> {
  const clean = scrub(text).trim().slice(0, 4000);
  if (!clean) throw new GroupError("Say something first.");
  const chars = await members(g);
  if (chars.length < 2) throw new GroupError("This group needs at least 2 characters.");
  const pt = privateTarget(clean, chars);
  if (pt) return await sendPrivate(caller, g, chars, pt.c, pt.body, timeZone, personName);
  const [mineRow] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${caller.userId}, ${clean}) returning id`;
  // They spoke: any back-and-forth between the characters stops right here.
  await sql()`update chat_groups set updated_at = now(), banter_left = 0, since_banter = since_banter + 1 where id = ${g.id}`;
  const names = new Map(chars.map(c => [c.id, c.name]));
  const out: GroupMsg[] = [];
  let rows = await groupMessages(caller.userId, g.id, 40);
  for (const c of pickSpeakers(clean, chars, seen(rows))) {
    try {
      const r = await askVelo(caller, { mode: "chat", messages: turnsFor(c.id, rows, names, personName), timeZone, name: personName, character: c, group: { others: chars.filter(x => x.id !== c.id).map(x => x.name), scene: g.scene_title ? { title: g.scene_title, details: g.scene_details || "", time: sceneClockNote(groupClock(g), await userTz(caller.userId)) } : null, inPerson: g.in_person_place ?? null, catchUp: g.catch_up?.[c.id] || "" } });
      const reply = scrub(r.reply.replace(/^\s*\[[^\]]{1,40}\]:\s*/, "")).trim().slice(0, 4000);
      if (r.react) await sql()`update chat_group_messages set their_reactions = their_reactions || ${JSON.stringify({ [c.id]: r.react })}::jsonb where id = ${mineRow.id}`;
      if (!reply) continue;
      const [m] = await sql()`insert into chat_group_messages (group_id, user_id, speaker_id, content) values (${g.id}, ${caller.userId}, ${c.id}, ${reply}) returning id, speaker_id, content, created_at`;
      out.push(m as GroupMsg);
      rows = [...rows, m as GroupMsg];
    } catch (e) { console.error("groups: speaker failed", c.name, e instanceof Error ? e.message : e); }
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
  const said = seen(rows);
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
  const marker = kind === "live" ? `🎬 Scene: ${t}${d ? ` — ${d}` : ""}` : `🎬 Scene (already happened, all of us together): ${t}${d ? ` — ${d}` : ""}`;
  const at = HHMM.test(setTime) ? setTime : "";
  if (kind === "live") await sql()`update chat_groups set in_person_place = null, catch_up = '{}'::jsonb, scene_title = ${t}, scene_details = ${d}, scene_clock = ${at ? "set" : "now"}, scene_set_time = ${at}, scene_started_at = now(), updated_at = now() where id = ${g.id} and user_id = ${userId}`;
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${marker}) returning id, speaker_id, content, created_at`;
  return { ...(m as GroupMsg), speaker_id: null };
}
export async function endGroupScene(userId: string, g: Group): Promise<GroupMsg | null> {
  if (!g.scene_title) return null;
  await sql()`update chat_groups set scene_title = null, scene_details = null where id = ${g.id} and user_id = ${userId}`;
  const [m] = await sql()`insert into chat_group_messages (group_id, user_id, content) values (${g.id}, ${userId}, ${`🎬 Scene ended: ${g.scene_title}`}) returning id, speaker_id, content, created_at`;
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
export async function draftGroupPeek(userId: string, g0: Group, ids: string[], adult: boolean, personName: string): Promise<string> {
  if (!g0.scene_title && g0.in_person_place == null) throw new GroupError("Peeks are for scenes or when you're together in person — start one first.");
  // 🧍 Together in person: the "scene" is just hanging out where you are, right now.
  const g = g0.scene_title ? g0 : { ...g0, scene_title: "Hanging out together in person", scene_details: g0.in_person_place || "", scene_clock: "now" };
  const chars = await pickedMembers(g, ids), all = await members(g);
  const names = new Map(all.map(c => [c.id, c.name]));
  const rows = await groupMessages(userId, g.id, 120);
  const lastPeek = [...rows].reverse().find(r => r.peek && r.media?.status === "done")?.media?.description || "";
  const lastIdx = rows.map(r => !!(r.peek && r.media)).lastIndexOf(true);
  const transcript = rows.filter((r, i) => !r.peek || i === lastIdx).map(r => (r.peek ? "— (your last peek was here) —" : `${r.speaker_id ? names.get(r.speaker_id) || "Someone" : personName || "Them"}: ${r.content}`)).join("\n");
  const who = chars.map(c => c.name).join(" and ");
  const romantic = chars.every(c => romanticFor(c, adult));
  const raw = await writeText(chars[0].brain, `You write the description for ONE photo for an image generator. The person is out with a group (the scene below) and is quietly looking at ${who} right now — the photo is exactly what they see: they are behind the camera and NOT in the picture. Show ONLY ${who}${chars.length < all.length ? ` (not ${all.filter(c => !chars.some(x => x.id === c.id)).map(c => c.name).join(" or ")})` : ""}. Describe the place (time of day, lighting), what each of them is wearing, what each is doing, their poses and expressions — candid and unaware, or glancing at the camera.
OUTFIT CONTINUITY: each of them wears ONE outfit for the whole scene. ${lastPeek ? "Start from what they wore in THE LAST PEEK" : "Start from the outfits in the scene's details or what they said they're wearing (else what fits the outing and their usual style)"}, then apply only the changes that actually happened, in order (a jacket taken off stays off until it's put back on, and so on). Keep every other detail identical. The same goes for the place.
${romantic ? "Tasteful and PG-13: flattering and flirty is fine; they're dressed (or in swimwear at the beach or pool)." : "Family-friendly, fully clothed."} Two or three sentences, under 380 characters, no names of real people, output only the description.`, `SCENE: ${g.scene_title}${g.scene_details ? ` — ${g.scene_details}` : ""}\nTIME IN THE SCENE: ${sceneTime(groupClock(g), await userTz(userId)).label} (match the light and sky to it)\n${chars.map(c => `${c.name.toUpperCase()}'S LOOK: ${c.appearance || "(see reference pictures)"}${c.casual_wear ? `; usual style: ${c.casual_wear}` : ""}`).join("\n")}${lastPeek ? `\nTHE LAST PEEK: ${lastPeek}` : ""}\n\nTHE SCENE SO FAR:\n${(transcript.length > 12000 ? "…" + transcript.slice(-12000) : transcript) || "(it just started)"}`, 350);
  const text = raw.replace(/\s+/g, " ").trim();
  return text.slice(0, 400) || sceneFallback(who, g.scene_title || "", g.scene_details || "", sceneTime(groupClock(g), await userTz(userId)).label, lastPeek);
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
    const ended = await sql()`delete from chat_in_person where user_id = ${userId} and character_id = ${c.id} returning 1`;
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
