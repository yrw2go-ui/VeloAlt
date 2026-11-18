// 📍 Someone local asking to see you. Now and then — never often — a character who lives near
// enough texts first: can she come round, would you come to hers, or shall you meet somewhere.
// Only from someone you've actually built something with, only when she's free, and at most one
// a day whoever it is. It's a text like any other: answer it, ignore it, nothing is held against you.
import { sql } from "./db";
import { getCharacter, type Character } from "./characters";
import { free, closeEnough } from "./neighbor";
import { closeness } from "./momentPics";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { sendPush } from "./push";
import { wordsFor } from "./wordsDb";
import { defaults as wordDefaults } from "./words";

export type InviteKind = "mine" | "yours" | "out";

/** How much talking counts as knowing each other at all. */
const ENOUGH_SAID = 30;
/** How likely she is to ask, once she's someone you're actually close to. */
const ODDS = { close: 0.6, warm: 0.3 } as const;

const PLAIN: Record<InviteKind, string[]> = {
  mine: ["what are you up to? Come round for a bit if you're free 🙂", "I'm doing nothing all evening — come over?", "kettle's on if you fancy coming round."],
  yours: ["are you home? I could swing by for an hour if you're about", "fancy some company? I can come to you 🙂", "I'm out this way later — alright if I stop in?"],
  out: ["fancy getting out for a bit? Coffee or something 🙂", "do you want to meet somewhere later? I need to get out of the house", "there's that place I keep meaning to try — come with me?"],
};

/** Her own words for it, or something plain and true if her brain can't answer. */
async function inviteLine(userId: string, c: Character, kind: InviteKind, name: string): Promise<string> {
  const w = { ...wordDefaults(), ...(await wordsFor(userId).catch(() => ({}))) };
  const key = kind === "mine" ? "ask_mine" : kind === "yours" ? "ask_yours" : "ask_out";
  const brief = String(w[key] || "").replace(/\{them\}/g, name || "them").replace(/\{name\}/g, c.name);
  const raw = await writeText(c.brain, `You are ${c.name}. ${c.personality || ""}
You live close to ${name || "them"} — near enough to see each other on an ordinary evening. ${brief}${c.hobbies ? `\nThings you're into: ${c.hobbies}` : ""}${c.lives_in ? `\nYou're in ${c.lives_in}.` : ""}
Write ONE short text in your own voice, the way you'd really send it — under 140 characters, no quotes, no sign-off. Just the text.`,
    "You're texting them first.", 80, { ms: 8_000 }).catch(() => "");
  const line = scrub(raw.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim()).slice(0, 200);
  return line || PLAIN[kind][Math.floor(Math.random() * PLAIN[kind].length)];
}

/** 📍 One roll for one person. Returns what was sent, or null when nobody asks this time.
 *  `force` skips the dice and the one-a-day wait — never the "do you two actually know each
 *  other" gate, which is the whole point of it. */
export async function maybeInvite(userId: string, force = false): Promise<{ characterId: string; who: string; kind: InviteKind; line: string } | null> {
  // One a day at most, whoever it is.
  const [recent] = await sql()`select 1 from chat_invites where user_id = ${userId} and created_at > now() - interval '20 hours' limit 1`;
  if (recent && !force) return null;
  const [u] = await sql()`select name from users where id = ${userId}`;
  // 📍 Local or next door, not someone who already lives with you, and nobody you're with right now.
  const rows = await sql()`select c.id from chat_characters c
    where (c.owner_id is null or (c.owner_id = ${userId} and c.intro_status = 'accepted')) and c.local and not c.live_in
      and not exists (select 1 from chat_invites i where i.character_id = c.id and i.user_id = ${userId} and i.created_at > now() - interval '3 days')
      and not exists (select 1 from chat_in_person p where p.user_id = ${userId} and p.character_id = c.id and p.ended_at is null)
      and not exists (select 1 from chat_scenes s where s.user_id = ${userId} and s.character_id = c.id and s.status = 'active')
      and exists (select 1 from velo_messages m where m.user_id = ${userId} and m.character_id = c.id and m.role = 'user')`;
  for (const r of rows.sort(() => Math.random() - 0.5)) {
    const c = await getCharacter(String(r.id)).catch(() => null);
    if (!c) continue;
    // 💛 Only someone you've built something with: a real back-and-forth behind you AND feelings
    // to go with it. The gate holds even when a round is forced — only the dice are skipped.
    const [{ said }] = await sql()`select count(*)::int as said from velo_messages where user_id = ${userId} and character_id = ${c.id} and role = 'user'`;
    if (Number(said) < ENOUGH_SAID) continue;
    if (!(await closeEnough(userId, c).catch(() => false))) continue;
    const odds = (await closeness(userId, c).catch(() => "warm")) === "close" ? ODDS.close : ODDS.warm;
    if (!(await free(userId, c).catch(() => false))) continue;
    if (!force && Math.random() > odds) continue;
    // 🏘️ Next door, so coming round either way is the easy thing; otherwise meeting out is likelier.
    const roll = Math.random();
    const kind: InviteKind = c.neighbor ? (roll < 0.45 ? "yours" : roll < 0.85 ? "mine" : "out") : roll < 0.35 ? "yours" : roll < 0.6 ? "mine" : "out";
    const line = await inviteLine(userId, c, kind, String(u?.name || ""));
    await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'assistant', ${line}, ${c.id})`;
    await sql()`insert into chat_invites (user_id, character_id, kind) values (${userId}, ${c.id}, ${kind})`;
    await sendPush(userId, { title: c.name, body: line.slice(0, 170), url: `/?chat=${c.id}`, icon: c.portrait_url || "/icon-192.png", tag: `chat-${c.id}` }).catch(() => {});
    return { characterId: c.id, who: c.name, kind, line };
  }
  return null;
}

/** ⏰ The round the scheduler runs: a few people, most of whom nobody asks. */
export async function runInvites(): Promise<number> {
  const users = await sql()`select id from users where exists (select 1 from chat_characters c where c.local and not c.live_in and (c.owner_id is null or c.owner_id = users.id)) order by random() limit 40`;
  let sent = 0;
  for (const u of users) {
    try { if (await maybeInvite(String(u.id))) sent++; }
    catch (e) { console.error("invites:", e instanceof Error ? e.message : e); }
  }
  return sent;
}
