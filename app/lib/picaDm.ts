// ✉️ Picagram DMs: private chats with Picagram accounts (people who aren't characters). They answer in
// their own voice and can send photos of themselves. Characters never DM here — they chat in the normal chat.
import { cleanReply, BRACKETS, writtenCall } from "./text";
import { PLAIN_WORDS } from "./characters";
import { traitsPrompt } from "./traits";
import { sql } from "./db";
import { writeText } from "./llm";
import { wordingFor } from "./wording";
import {  say } from "./words";
import { wordsFor } from "./wordsDb";
import { forgetPicaLines } from "./forget";
import { scrub } from "./secrets";
import { wornLately, startMedia, MediaError, type Media } from "./media";
import { availableBrains } from "./models";
import { refsOf, myPhotoDraft, myPhotoMake } from "./picagram";
import { BRAIN_OPTIONS } from "./brainOptions";
import { isValidTimeZone, zonedParts, formatClock } from "./localTime";
import { partOfDay } from "./calendar";
import { cleanTraits } from "./traits";
import { giftById, photoBrief, giftFace, wearOdds, PHOTO_ODDS } from "./gifts";

export type Dm = { id: string; role: "user" | "assistant"; content: string; created_at: string; media: Media | null };
export class DmError extends Error {}

async function account(userId: string, accountId: string) {
  const [a] = await sql()`select a.*, f.url as avatar from pica_accounts a left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id
    where a.id = ${accountId} and a.user_id = ${userId}`;
  if (!a) throw new DmError("That account wasn't found.");
  if (a.character_id) throw new DmError(`${a.name} is one of your characters now — chat with her in Chat.`);
  return a;
}
const userInfo = async (userId: string) => {
  const [u] = await sql()`select name, adult_confirmed_at, chat_model, time_zone from users where id = ${userId}`;
  return { name: String(u?.name || "").split(/\s+/)[0] || "them", adult: !!u?.adult_confirmed_at, chatModel: String(u?.chat_model || "claude"), now: nowLabel(u?.time_zone), today: todayLabel(u?.time_zone) };
};
/** The date where they are, short ("Nov 12, 2026"), to stamp her notes. */
function todayLabel(rawTz: unknown): string {
  const tz = isValidTimeZone(rawTz) ? String(rawTz) : "America/Chicago";
  const p = zonedParts(Date.now(), tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
const undated = (t: string) => t.replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4}: /, "");
// 🕒 What day and time it is (where they are), so she lives on the same clock: "good morning", "it's late", weekends…
function nowLabel(rawTz: unknown): string {
  const tz = isValidTimeZone(rawTz) ? String(rawTz) : "America/Chicago";
  const now = Date.now(), p = zonedParts(now, tz);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day, 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `RIGHT NOW: ${day}, ${formatClock(now, tz)} (${partOfDay(p.hour)}). Act like you know it — say good morning/night when it fits, notice if it's late, weekends, holidays — but don't announce the time unless it matters.`;
}
// 🧠 Her brain: her own pick, or the same as Velo's ('' / 'claude' = Claude).
const brainOf = (a: Record<string, unknown>, chatModel: string) => { const b = String(a.brain || "") || chatModel; return b === "claude" ? "" : b; };
// Writing her line: logged (not hidden) when it fails.
const write = (brain: string, system: string, user: string, max: number) =>
  writeText(brain, system, user, max).catch(e => { console.error("pica dm: brain failed", e instanceof Error ? e.message : e); return ""; });
/** 🧠 What she remembers about them from your DMs. */
async function memories(userId: string, accountId: string): Promise<string[]> {
  return (await sql()`select text from pica_memories where user_id = ${userId} and account_id = ${accountId} order by created_at desc limit 25`).map(r => String(r.text)).reverse();
}
export async function dmBrain(userId: string, accountId: string, brain: string): Promise<boolean> {
  const ok = brain === "" || brain === "claude" || availableBrains().includes(brain);
  if (!ok) throw new DmError("That brain isn't set up.");
  const r = await sql()`update pica_accounts set brain = ${brain} where id = ${accountId} and user_id = ${userId} returning id`;
  return r.length > 0;
}

const rowToDm = (r: Record<string, unknown>): Dm => ({
  id: String(r.id), role: r.role as "user" | "assistant", content: String(r.content || ""), created_at: String(r.at),
  media: r.media_id ? ({ id: String(r.media_id), kind: r.m_kind, status: r.m_status, url: r.m_status === "done" ? r.m_url : null, thumb: r.m_thumb || null, kept: !!r.m_kept } as Media) : null,
});
async function messages(userId: string, accountId: string, limit = 60): Promise<Dm[]> {
  const rows = await sql()`select d.id, d.role, d.content, d.created_at::text as at, d.media_id, m.kind as m_kind, m.status as m_status, m.kept as m_kept, f.url as m_url, t.url as m_thumb
    from pica_dms d left join velo_media m on m.id = d.media_id left join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where d.user_id = ${userId} and d.account_id = ${accountId} order by d.created_at desc limit ${limit}`;
  return rows.reverse().map(rowToDm);
}

/** 📥 The inbox: one row per account they've messaged with, newest first. */
export async function dmThreads(userId: string) {
  const rows = await sql()`select distinct on (d.account_id) d.account_id, d.content, d.media_id, d.role, d.created_at::text as at, a.handle, a.name, f.url as avatar,
      (select count(*)::int from pica_dms x where x.user_id = d.user_id and x.account_id = d.account_id and x.role = 'assistant' and x.read_at is null) as unread
    from pica_dms d join pica_accounts a on a.id = d.account_id and a.character_id is null left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id
    where d.user_id = ${userId} order by d.account_id, d.created_at desc`;
  return rows.map(r => ({ account: { id: String(r.account_id), handle: String(r.handle), name: String(r.name), avatar: r.avatar ? String(r.avatar) : null },
    last: r.media_id && !r.content ? "📷 Photo" : `${r.role === "user" ? "You: " : ""}${String(r.content).slice(0, 80)}`, at: String(r.at), unread: Number(r.unread) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
export async function dmUnread(userId: string): Promise<number> {
  const [r] = await sql()`select count(*)::int as n from pica_dms d join pica_accounts a on a.id = d.account_id and a.character_id is null where d.user_id = ${userId} and d.role = 'assistant' and d.read_at is null`;
  return Number(r?.n || 0);
}
export async function dmOpen(userId: string, accountId: string) {
  const a = await account(userId, accountId);
  await sql()`update pica_dms set read_at = now() where user_id = ${userId} and account_id = ${accountId} and read_at is null`;
  return { account: { id: String(a.id), handle: String(a.handle), name: String(a.name), avatar: a.avatar ? String(a.avatar) : null, brain: String(a.brain || "") },
    brains: [{ id: "", label: "Same as Velo" }, ...BRAIN_OPTIONS.filter(o => !o.atlas || availableBrains().includes(o.id)).map(o => ({ id: o.id as string, label: o.label as string }))],
    messages: await messages(userId, accountId) };
}

async function sendPhotoOf(userId: string, a: Record<string, unknown>, description: string, adult: boolean, raw = false): Promise<Media> {
  return startMedia(userId, { kind: "image", with_me: true, they_asked: true, description },
    { characterId: null, who: String(a.name), appearance: String(a.look || ""), refs: await refsOf(a), romantic: adult, offer: false, other: null, pica: true, ...(raw ? { raw: true } : {}) });
}
async function addDm(userId: string, accountId: string, role: "user" | "assistant", content: string, mediaId: string | null = null, delayMs = 0): Promise<Dm> {
  const [r] = await sql()`insert into pica_dms (user_id, account_id, role, content, media_id, created_at, read_at)
    values (${userId}, ${accountId}, ${role}, ${content}, ${mediaId}, now() + ${`${delayMs} milliseconds`}::interval, ${role === "user" ? new Date().toISOString() : null}) returning id, role, content, media_id, created_at::text as at`;
  return rowToDm(r);
}
const transcript = (list: Dm[], her: string, me: string) => list.slice(-30).map(m => `${m.role === "user" ? me : her}: ${m.media ? "(sent a photo) " : ""}${m.content}`).join("\n");

// "sending you one", "here's a selfie", "📸" — and a refusal, to tell them apart.
const CLAIMS_PHOTO = /\b(send(ing)?|sent|here'?s|here you go|snapp(ing|ed)|taking|took|coming (your way|right up)|on (its|it's) way|round two)\b[\s\S]{0,60}\b(pics?|pictures?|photos?|images?|selfies?|snaps?|shots?|it|one|this)\b|📸|🤳/i;
const REFUSES_PHOTO = /\b(can'?t|cannot|won'?t|not (going to|gonna)|no (pics?|photos?|selfies?)|maybe later|not right now)\b/i;

/** What photo she meant to send, from the conversation (used when she says one's coming but picks none). */
async function describePhoto(userId: string, a: Record<string, unknown>, u: { name: string; now: string; adult: boolean; chatModel: string }, history: Dm[]): Promise<string> {
  const w = await wordingFor(userId);
  const worn = await wornLately(userId, null, true).catch(() => "");
  const raw = await write(brainOf(a, u.chatModel), `You are ${a.name} (@${a.handle}) on Picagram. You told ${u.name} you'd send a photo of yourself, and it hasn't gone out yet. Describe exactly the photo you meant (where, outfit, pose, light) in 1–2 sentences${u.adult ? ", tasteful and PG-13 — flattering and flirty is fine, never nudity or lingerie" : ", fully clothed"}. ${w.no_looks} JSON only: {"photo":"..."}`,
    `${u.now}\nYou look like: ${a.look}${worn ? `\n\n${worn}` : ""}\n\nTHE CONVERSATION:\n${transcript(history, String(a.name), u.name)}`, 400);
  try { return String(JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).photo || ""); } catch { return ""; }
}

/** 💬 They send a DM; she answers in her own voice (and sometimes with a photo of herself). */
/**
 * 🗑 Delete messages from a DM thread — the written ones only. A message carrying a picture is
 * left alone: her photos are yours to keep (delete one from the gallery if you want it gone).
 * Returns how many went.
 */
/** ✏️ Reword one written message in a thread. Pictures and empty text are left alone. */
export async function dmEdit(userId: string, accountId: string, id: string, text: string): Promise<{ id: string; content: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const body = scrub(String(text ?? "").replace(/\r/g, "").trim()).slice(0, 2000);
  if (!body) return null;
  const [row] = await sql()`update pica_dms set content = ${body}
    where id = ${id} and user_id = ${userId} and account_id = ${accountId} and media_id is null returning id, content`;
  return row ? { id: String(row.id), content: String(row.content) } : null;
}

export async function dmDelete(userId: string, accountId: string, ids: string[]): Promise<number> {
  const want = ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (!want.length) return 0;
  const gone = await sql()`delete from pica_dms where user_id = ${userId} and account_id = ${accountId}
    and id = any(${want}::uuid[]) and media_id is null returning id, role, content, created_at::text`;
  if (!gone.length) return 0;
  // 🧠 …and she forgets what she only knew because of them, the same as deleting a chat message.
  try {
    const a = await account(userId, accountId);
    const u = await userInfo(userId);
    const since = gone.map(r => String(r.created_at)).sort()[0];
    const lines = gone.map(r => `${r.role === "assistant" ? String(a.name) : u.name || "Them"}: ${String(r.content).slice(0, 600)}`).join("\n");
    await forgetPicaLines(userId, accountId, lines, since, brainOf(a, u.chatModel));
  } catch (e) { console.error("pica dm: forget", e instanceof Error ? e.message : e); }
  return gone.length;
}

export async function dmSend(userId: string, accountId: string, text: string): Promise<{ added: Dm[]; note?: string; ask?: string }> {
  const a = await account(userId, accountId);
  const t = scrub(text).trim().slice(0, 2000);
  if (!t) throw new DmError("Say something first.");
  const u = await userInfo(userId);
  const mine = await addDm(userId, accountId, "user", t);
  const history = await messages(userId, accountId, 40);
  // 🗣️ Anyone they named in their message: she knows OF them from this, nothing more.
  const named = await namedToAccount(userId, accountId, text).catch(() => "");
  const mem = await memories(userId, accountId);
  const w = await wordingFor(userId);
  const tw = await wordsFor(userId); // 🛠️ Admin → Messaging & wording: the same lines her chats use.
  const raw = await write(brainOf(a, u.chatModel), `You are ${a.name} (@${a.handle}) on Picagram, a social photo app like Instagram. Your bio: "${a.bio}". You look like: ${a.look}.${a.lives ? ` You live in ${a.lives}.` : ""}${a.personality ? `\nWHO YOU ARE: ${String(a.personality).slice(0, 1200)}` : ""}${a.traits && Object.keys(a.traits).length ? `\n${traitsPrompt(a.traits, !!u.adult)}` : ""} You're a real person with your own life; ${u.name} follows you and is messaging you in your DMs. Reply like Instagram DMs: short (1–3 sentences), casual, warm, in your own voice${u.adult ? ", flirty if it fits (PG-13: never nudity, lingerie or anything sexual)" : ", friendly and family-friendly"}. Never say you're an AI. ${say(tw.brackets, u.name, String(a.name))} ${tw.plain} ${tw.slang} ${say(tw.fresh, u.name, String(a.name))} If they ask for a photo of you (or it fits naturally), you can send one: then set "photo" to exactly what the picture shows (where, outfit, pose, light) in 1–2 sentences${u.adult ? "; tasteful and PG-13 — flattering and flirty is fine, never nudity or lingerie" : ", fully clothed"}. ${w.no_looks} Otherwise leave "photo" empty. Reply with JSON only: {"reply":"...","photo":""}`,
    `${u.now}\n\n${named ? `${named}\n\n` : ""}${mem.length ? `WHAT YOU REMEMBER ABOUT ${u.name.toUpperCase()} (from your DMs):\n- ${mem.join("\n- ")}\n\n` : ""}THE CONVERSATION SO FAR:\n${transcript(history, String(a.name), u.name)}`, 800);
  // Her answer: the JSON asked for — or, if she just wrote her reply as plain text, that text.
  let j: { reply?: string; photo?: string } = {};
  const obj = raw.match(/\{[\s\S]*\}/);
  try { j = obj ? JSON.parse(obj[0]) : { reply: raw }; } catch { j = { reply: raw.replace(/\{[\s\S]*\}/, "").trim() || raw }; }
  if (typeof j.reply !== "string" && !obj) j.reply = raw;
  // 🙈 Stage directions, leaked tool calls and code fences are dropped — they're not a message.
  const reply = scrub(cleanReply(String(j.reply || "")).replace(/\s+/g, " ").trim()).slice(0, 2000);
  // 💭 All they sent was a thought in brackets: there's nothing to answer, so saying nothing is
  // right — no "she didn't answer" note, and the thought stays in the thread.
  const thoughtOnly = /^\s*\[[^\]]*\]\s*$/.test(text.trim());
  if (!reply && thoughtOnly) return { added: [mine] };
  // Her brain didn't answer: say so (no fake 😊), and they can send again or pick another brain.
  if (!reply) return { added: [mine], note: `${a.name} didn't answer — her brain didn't respond. Try again, or pick another brain (🧠 at the top).` };
  const added: Dm[] = [mine, await addDm(userId, accountId, "assistant", reply)];
  let note: string | undefined;
  // 📸 She said a photo was coming but didn't actually pick one: work out what she meant and send it,
  // so what she says and what arrives always match (the same as in the normal chat).
  // 🧰 She wrote the call out as words instead of filling in "photo": take the description from it.
  const written = writtenCall(String(j.reply || ""));
  if (!(j.photo && String(j.photo).trim()) && written) j.photo = written.description;
  if (!(j.photo && String(j.photo).trim()) && CLAIMS_PHOTO.test(reply) && !REFUSES_PHOTO.test(reply)) {
    j.photo = await describePhoto(userId, a, u, [...history, added[1]]).catch(e => { console.warn("pica dm: describe", e instanceof Error ? e.message : e); return ""; });
  }
  // 📸 She's sending a photo: you see exactly what's going to the picture service first, and send
  // it yourself — the same two steps as a peek.
  const ask = j.photo && String(j.photo).trim() ? scrub(String(j.photo)).replace(/\s+/g, " ").trim().slice(0, 600) : "";
  await sql()`update pica_dms set read_at = now() where user_id = ${userId} and account_id = ${accountId} and read_at is null`;
  // 🧠 Every few messages she files away what matters (it goes with her if you befriend her).
  const [{ n }] = await sql()`select count(*)::int as n from pica_dms where user_id = ${userId} and account_id = ${accountId} and role = 'user'`;
  if (n % 4 === 0) await remember(userId, a, [...history, ...added.slice(1)], u.name, mem, brainOf(a, u.chatModel), u.now, u.today).catch(e => console.error("pica dm: remember", e instanceof Error ? e.message : e));
  return { added, ...(note ? { note } : {}), ...(ask ? { ask } : {}) };
}

/** 🗣️ Who they just named in a DM: her characters and the other women on their Picagram. She knows
 *  OF them from being told — never met, no history, free to ask or look them up. */
async function namedToAccount(userId: string, accountId: string, text: string): Promise<string> {
  const t = String(text || "");
  if (t.length < 3) return "";
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = (name: string) => name.length >= 3 && new RegExp(`(^|[^\\p{L}])${esc(name)}(?=$|[^\\p{L}])`, "iu").test(t);
  const chars = (await sql()`select name, lives_in from chat_characters where owner_id is null or owner_id = ${userId}`).filter(c => hit(String(c.name).trim()));
  const others = (await sql()`select name, handle, bio from pica_accounts where user_id = ${userId} and id <> ${accountId}`)
    .filter(a => hit(String(a.name).trim().split(/\s+/)[0] || "") || new RegExp(`@?${esc(String(a.handle))}\\b`, "i").test(t));
  const lines = [
    ...chars.map(c => `- ${c.name}${c.lives_in ? ` (${c.lives_in})` : ""} — someone in ${"their"} life`),
    ...others.map(a => `- ${a.name} (@${a.handle}) — she's on Picagram too${a.bio ? `: "${String(a.bio).slice(0, 100)}"` : ""}`),
  ];
  if (!lines.length) return "";
  return `🗣️ WHO THEY JUST NAMED (you have NOT met any of them):\n${lines.join("\n")}\nYou only know these people because they were just mentioned to you. Be curious — ask who she is or how they know each other — and you can look someone up on Picagram and say what's on her profile. Never pretend you know her or make up history with her.`;
}

/** 📸 "Send the pic": she said she'd send a photo but none came — she sends it now. */
export async function dmSendPhoto(userId: string, accountId: string): Promise<{ added: Dm[]; note?: string; ask?: string }> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const history = await messages(userId, accountId, 30);
  const photo = scrub((await describePhoto(userId, a, u, history).catch(() => "")) || `${a.name} taking a selfie, smiling at the camera`).replace(/\s+/g, " ").trim().slice(0, 600);
  // 📸 You see what she's sending before it's made, and send it yourself.
  return { added: [], ask: photo };
}

/** 📸 Send it: exactly what you've got in front of you goes to the picture service, like a peek. */
export async function dmPhotoMake(userId: string, accountId: string, description: string): Promise<{ added: Dm[]; note?: string }> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const photo = scrub(description).replace(/\s+/g, " ").trim().slice(0, 1500);
  if (photo.length < 5) throw new DmError("Say what the picture shows.");
  try {
    const m = await sendPhotoOf(userId, a, photo, u.adult, true);
    const d = await addDm(userId, accountId, "assistant", "", m.id);
    await sql()`update pica_dms set read_at = now() where id = ${d.id}`;
    return { added: [{ ...d, media: m }] };
  } catch (e) {
    return { added: [], note: e instanceof MediaError ? e.message.replace(/ Tell them[\s\S]*$/, "") : "Couldn't send it right now — try again in a moment." };
  }
}

async function remember(userId: string, a: Record<string, unknown>, list: Dm[], name: string, known: string[], brain: string, now: string, today: string) {
  const raw = await write(brain, `You are ${a.name}. From your recent Picagram DMs with ${name}, list up to 3 NEW things worth remembering (about ${name}: their life, likes, plans, what they told you — or what happened between you two). Short, first person ("${name} told me…", "We…"). Skip anything already known. When something has a time to it (plans, "tomorrow", "this weekend"), write the actual date. JSON only: {"facts":["..."]}`,
    `${now}\n\nALREADY KNOWN:\n${known.length ? known.map(k => `- ${k}`).join("\n") : "(nothing yet)"}\n\nRECENT DMs:\n${transcript(list.slice(-16), String(a.name), name)}`, 500);
  let facts: unknown[] = [];
  try { facts = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).facts || []; } catch { /* nothing new */ }
  for (const f of facts.slice(0, 3)) {
    const t = scrub(String(f || "")).replace(/\s+/g, " ").trim().slice(0, 600);
    // 📅 Each note carries the day it was made ("Nov 12, 2026: Sam told me…").
    if (t.length >= 6 && !known.some(k => undated(k) === undated(t))) await sql()`insert into pica_memories (user_id, account_id, text) values (${userId}, ${a.id}, ${`${today}: ${undated(t)}`.slice(0, 600)})`;
  }
}

/**
 * 🎁 A present landed in her DMs: she usually sends a photo of herself with it, the same as a
 * character does in the chat — her own face from her reference pictures, her own expression.
 */
export async function dmGiftPhoto(userId: string, accountId: string, what: string, kind: "gift" | "money", giftId: string, closeness = 50, big = false): Promise<void> {
  if (Math.random() >= PHOTO_ODDS) return void console.log("pica dm: no gift photo this time (not every present gets one)");
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const g = giftId ? giftById(giftId) : null;
  const t = cleanTraits((a.traits || {}) as Record<string, unknown>);
  const who = g?.team || g?.theirs ? ` ${a.bio || ""} ${a.lives || ""}`.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const desc = `${photoBrief(what, kind, g, wearOdds(t, closeness)).brief}. ${giftFace(t, closeness, big)}${who ? ` About her: ${who}` : ""} It is clearly the same woman as in the reference pictures — her face, her hair, her build. Taken on her own phone where she is, candid and real.`;
  const m = await sendPhotoOf(userId, a, scrub(desc).replace(/\s+/g, " ").trim().slice(0, 1500), u.adult)
    .catch(e => { console[e instanceof MediaError ? "warn" : "error"]("pica dm: gift photo", e instanceof Error ? e.message : e); return null; });
  if (m && m.status !== "failed") await addDm(userId, accountId, "assistant", "", m.id, 1000);
  else if (m) console.warn("pica dm: gift photo came back failed");
}

/** 📸 A photo of YOU in her DMs: the same two steps as a peek — a description to check, then exactly that. */
export async function dmMyPhotoDraft(userId: string, accountId: string, about: string): Promise<string> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const history = await messages(userId, accountId, 12);
  return myPhotoDraft(userId, about, `a DM to ${a.name} (@${a.handle}). Recent messages:\n${transcript(history, String(a.name), u.name)}`);
}
/**
 * 🖼️ A picture you already have — one from your gallery, or one you've just uploaded from the
 * phone — sent to her in the DMs. She sees it and says something back, same as one you had made.
 */
export async function dmSendMine(userId: string, accountId: string, mediaId: string): Promise<{ added: Dm[]; note?: string }> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const [m] = await sql()`select m.id, m.kind, m.status, m.description, m.kept, f.url, t.url as thumb from velo_media m join velo_files f on f.id = m.file_id
    left join velo_files t on t.id = m.thumb_file_id where m.id = ${mediaId} and m.user_id = ${userId} and m.kind = 'image' and m.status = 'done'`;
  if (!m) throw new DmError("That picture wasn't found.");
  const media: Media = { id: String(m.id), kind: "image", status: "done", url: String(m.url), thumb: m.thumb ? String(m.thumb) : null, description: m.description ? String(m.description) : null, kept: !!m.kept };
  const mine = { ...(await addDm(userId, accountId, "user", "", media.id)), media };
  const history = await messages(userId, accountId, 40);
  const raw = await write(brainOf(a, u.chatModel), `You are ${a.name} (@${a.handle}) on Picagram. ${u.name} just sent you a photo in your DMs. React in your own voice — short (1–2 sentences), warm${u.adult ? ", flirty if it fits (PG-13)" : ""}. Never say you're an AI. ${PLAIN_WORDS} Reply with only your message.`,
    `${u.now}\n\nTHE PHOTO THEY SENT: ${scrub(String(media.description || "a photo from their gallery")).slice(0, 400)}\n\nTHE CONVERSATION:\n${transcript(history, String(a.name), u.name)}`, 400).catch(() => "");
  const reply = scrub(raw.replace(/^```(json)?|```$/g, "").replace(/\s+/g, " ").trim()).slice(0, 2000);
  const added: Dm[] = [mine];
  if (reply) added.push(await addDm(userId, accountId, "assistant", reply));
  await sql()`update pica_dms set read_at = now() where user_id = ${userId} and account_id = ${accountId} and read_at is null`;
  return { added };
}

export async function dmMyPhoto(userId: string, accountId: string, description: string): Promise<{ added: Dm[]; note?: string }> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const m = await myPhotoMake(userId, description);
  const mine = { ...(await addDm(userId, accountId, "user", "", m.id)), media: m };
  // She sees it and says something back.
  const history = await messages(userId, accountId, 40);
  const raw = await write(brainOf(a, u.chatModel), `You are ${a.name} (@${a.handle}) on Picagram. ${u.name} just sent you a photo of themselves in your DMs. React in your own voice — short (1–2 sentences), warm${u.adult ? ", flirty if it fits (PG-13)" : ""}. Never say you're an AI. Reply with only your message.`,
    `${u.now}\n\nTHE PHOTO THEY SENT: ${scrub(description).slice(0, 400)}\n\nTHE CONVERSATION:\n${transcript(history, String(a.name), u.name)}`, 400);
  const reply = scrub(raw.replace(/^```(json)?|```$/g, "").replace(/\s+/g, " ").trim()).slice(0, 2000);
  const added: Dm[] = [mine];
  if (reply) added.push(await addDm(userId, accountId, "assistant", reply));
  await sql()`update pica_dms set read_at = now() where user_id = ${userId} and account_id = ${accountId} and read_at is null`;
  return { added };
}
