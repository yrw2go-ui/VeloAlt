// ✉️ Picagram DMs: private chats with Picagram accounts (people who aren't characters). They answer in
// their own voice and can send photos of themselves. Characters never DM here — they chat in the normal chat.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { startMedia, MediaError, type Media } from "./media";

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
  const [u] = await sql()`select name, adult_confirmed_at from users where id = ${userId}`;
  return { name: String(u?.name || "").split(/\s+/)[0] || "them", adult: !!u?.adult_confirmed_at };
};

const rowToDm = (r: Record<string, unknown>): Dm => ({
  id: String(r.id), role: r.role as "user" | "assistant", content: String(r.content || ""), created_at: String(r.at),
  media: r.media_id ? ({ id: String(r.media_id), kind: r.m_kind, status: r.m_status, url: r.m_status === "done" ? r.m_url : null, thumb: r.m_thumb || null } as Media) : null,
});
async function messages(userId: string, accountId: string, limit = 60): Promise<Dm[]> {
  const rows = await sql()`select d.id, d.role, d.content, d.created_at::text as at, d.media_id, m.kind as m_kind, m.status as m_status, f.url as m_url, t.url as m_thumb
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
  return { account: { id: String(a.id), handle: String(a.handle), name: String(a.name), avatar: a.avatar ? String(a.avatar) : null }, messages: await messages(userId, accountId) };
}

async function sendPhotoOf(userId: string, a: Record<string, unknown>, description: string, adult: boolean): Promise<Media> {
  return startMedia(userId, { kind: "image", with_me: true, they_asked: true, description },
    { characterId: null, who: String(a.name), appearance: String(a.look || ""), refs: a.avatar ? [String(a.avatar)] : [], romantic: adult, offer: false, other: null, pica: true });
}
async function addDm(userId: string, accountId: string, role: "user" | "assistant", content: string, mediaId: string | null = null, delayMs = 0): Promise<Dm> {
  const [r] = await sql()`insert into pica_dms (user_id, account_id, role, content, media_id, created_at, read_at)
    values (${userId}, ${accountId}, ${role}, ${content}, ${mediaId}, now() + ${`${delayMs} milliseconds`}::interval, ${role === "user" ? new Date().toISOString() : null}) returning id, role, content, media_id, created_at::text as at`;
  return rowToDm(r);
}
const transcript = (list: Dm[], her: string, me: string) => list.slice(-30).map(m => `${m.role === "user" ? me : her}: ${m.media ? "(sent a photo) " : ""}${m.content}`).join("\n");

/** 💬 They send a DM; she answers in her own voice (and sometimes with a photo of herself). */
export async function dmSend(userId: string, accountId: string, text: string): Promise<{ added: Dm[]; note?: string }> {
  const a = await account(userId, accountId);
  const t = scrub(text).trim().slice(0, 2000);
  if (!t) throw new DmError("Say something first.");
  const u = await userInfo(userId);
  const mine = await addDm(userId, accountId, "user", t);
  const history = await messages(userId, accountId, 40);
  const raw = await writeText("", `You are ${a.name} (@${a.handle}) on Picagram, a social photo app like Instagram. Your bio: "${a.bio}". You look like: ${a.look}. You're a real person with your own life; ${u.name} follows you and is messaging you in your DMs. Reply like Instagram DMs: short (1–3 sentences), casual, warm, in your own voice${u.adult ? ", flirty if it fits (PG-13: never nudity, lingerie or anything sexual)" : ", friendly and family-friendly"}. Never say you're an AI. If they ask for a photo of you (or it fits naturally), you can send one: then set "photo" to exactly what the picture shows (where, outfit, pose, light) in 1–2 sentences${u.adult ? "; tasteful and PG-13 — flattering and flirty is fine, never nudity or lingerie" : ", fully clothed"}. Otherwise leave "photo" empty. Reply with JSON only: {"reply":"...","photo":""}`,
    `THE CONVERSATION SO FAR:\n${transcript(history, String(a.name), u.name)}`, 800).catch(() => "");
  let j: { reply?: string; photo?: string } = {};
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { j = { reply: raw }; }
  const reply = scrub(String(j.reply || "").replace(/\s+/g, " ").trim()).slice(0, 2000) || "😊";
  const added: Dm[] = [mine, await addDm(userId, accountId, "assistant", reply)];
  let note: string | undefined;
  if (j.photo && String(j.photo).trim()) {
    try { const m = await sendPhotoOf(userId, a, scrub(String(j.photo)).slice(0, 600), u.adult); added.push({ ...(await addDm(userId, accountId, "assistant", "", m.id, 5)), media: m }); }
    catch (e) { note = e instanceof MediaError ? e.message.replace(/ Tell them[\s\S]*$/, "") : "Her photo didn't go through."; console.warn("pica dm: photo", e instanceof Error ? e.message : e); }
  }
  await sql()`update pica_dms set read_at = now() where user_id = ${userId} and account_id = ${accountId} and read_at is null`;
  return { added, ...(note ? { note } : {}) };
}

/** 📸 "Send the pic": she said she'd send a photo but none came — she sends it now. */
export async function dmSendPhoto(userId: string, accountId: string): Promise<{ added: Dm[]; note?: string }> {
  const a = await account(userId, accountId);
  const u = await userInfo(userId);
  const history = await messages(userId, accountId, 30);
  const raw = await writeText("", `You are ${a.name} (@${a.handle}) on Picagram. You told ${u.name} you'd send a photo of yourself but it never went through. Describe exactly the photo you meant to send (where, outfit, pose, light) in 1–2 sentences${u.adult ? ", tasteful and PG-13 — flattering and flirty is fine, never nudity or lingerie" : ", fully clothed"}. JSON only: {"photo":"..."}`,
    `You look like: ${a.look}\n\nTHE CONVERSATION:\n${transcript(history, String(a.name), u.name)}`, 400).catch(() => "");
  let photo = "";
  try { photo = String(JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).photo || ""); } catch { /* fall back */ }
  photo = scrub(photo || `${a.name} taking a selfie, smiling at the camera`).slice(0, 600);
  try {
    const m = await sendPhotoOf(userId, a, photo, u.adult);
    const d = await addDm(userId, accountId, "assistant", "", m.id);
    await sql()`update pica_dms set read_at = now() where id = ${d.id}`;
    return { added: [{ ...d, media: m }] };
  } catch (e) {
    return { added: [], note: e instanceof MediaError ? e.message.replace(/ Tell them[\s\S]*$/, "") : "Couldn't send it right now — try again in a moment." };
  }
}
