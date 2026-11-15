// ↻ Redo a picture from the prompt that made it. Works on anything you own: a Picagram woman's
// profile picture or post, a character's headshot, her gallery, a photo in a chat.
//
// The new picture carries a link to the one it's replacing, so the swap only happens once it
// really exists. Then it takes the old one's place everywhere, and the old one is deleted outright.
import { sql } from "./db";
import { scrub } from "./secrets";
import { startMedia, deleteMedia, MediaError, type Media } from "./media";
import { referenceUrls, type Character } from "./characters";
import { mediaMood, allowsSuggestive } from "./traits";

export type What = "profile picture" | "post" | "headshot" | "photo";

type Row = {
  id: string; prompt: string; character_id: string | null; kind: string;
  is_avatar: boolean; is_post: boolean; is_portrait: boolean;
};

async function find(userId: string, mediaId: string): Promise<Row | null> {
  const [m] = await sql()`select m.id, m.prompt, m.character_id, m.kind,
      exists(select 1 from pica_accounts a where a.user_id = ${userId} and a.avatar_media_id = m.id) as is_avatar,
      exists(select 1 from pica_posts p where p.user_id = ${userId} and p.media_id = m.id) as is_post,
      exists(select 1 from chat_characters c where c.portrait_file_id = m.file_id) as is_portrait
    from velo_media m where m.id = ${mediaId} and m.user_id = ${userId} and m.status = 'done' and m.kind = 'image'`;
  return (m as Row) || null;
}

const what = (m: Row): What => (m.is_avatar ? "profile picture" : m.is_portrait ? "headshot" : m.is_post ? "post" : "photo");

/** Step 1: the exact prompt that made it, and what it is. */
export async function redoDraft(userId: string, mediaId: string): Promise<{ prompt: string; what: What } | null> {
  const m = await find(userId, mediaId);
  return m ? { prompt: String(m.prompt || ""), what: what(m) } : null;
}

/** Step 2: make the replacement. The prompt goes to the picture service exactly as written. */
export async function redoMake(userId: string, mediaId: string, prompt: string): Promise<Media> {
  const m = await find(userId, mediaId);
  if (!m) throw new MediaError("That picture can't be redone.");
  const text = scrub(prompt.replace(/\s+/g, " ").trim()).slice(0, 1500);
  if (text.length < 10) throw new MediaError("Say a little more about the picture.");
  const [u] = await sql()`select adult_confirmed_at, name, bio_photo_note from users where id = ${userId}`;
  const adult = !!u?.adult_confirmed_at;

  // Who it's of, and which other pictures keep the face the same — never the one being replaced.
  let ctx: Parameters<typeof startMedia>[2];
  if (m.character_id) {
    const [c] = await sql()`select * from chat_characters where id = ${m.character_id}`;
    if (!c) throw new MediaError("That character wasn't found.");
    const ch = c as unknown as Character;
    const refs = (await referenceUrls(ch).catch(() => [])).filter(Boolean);
    ctx = { characterId: ch.id, who: ch.name, appearance: ch.appearance || "", refs, romantic: adult && !!ch.romantic && allowsSuggestive(ch.traits), mood: mediaMood(ch.traits), offer: false, other: null, raw: true };
  } else {
    const [a] = await sql()`select a.* from pica_accounts a where a.user_id = ${userId}
      and (a.avatar_media_id = ${mediaId} or exists(select 1 from pica_posts p where p.media_id = ${mediaId} and p.account_id = a.id))`;
    if (a) {
      const { refsOf } = await import("./picagram");
      ctx = { characterId: null, who: String(a.name), appearance: String(a.look || ""), refs: (await refsOf(a)).filter(Boolean), romantic: adult, offer: false, other: null, pica: true, raw: true };
    } else {
      // One of their own photos.
      const { myRefs } = await import("./picagram");
      ctx = { characterId: null, who: String(u?.name || "them"), appearance: String(u?.bio_photo_note || ""), refs: await myRefs(userId).catch(() => []), romantic: adult, offer: false, other: null, raw: true };
    }
  }
  const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: text }, ctx);
  await sql()`update velo_media set replaces = ${mediaId} where id = ${media.id}`;
  return media;
}

/** 🔁 It's ready: it takes the old one's place everywhere, and the old one goes for good. */
export async function swapIn(userId: string, newId: string): Promise<boolean> {
  const [m] = await sql()`select replaces, file_id from velo_media where id = ${newId} and user_id = ${userId} and status = 'done' and replaces is not null`;
  if (!m) return false;
  const old = String(m.replaces);
  const [was] = await sql()`select file_id from velo_media where id = ${old}`;
  // 📸 Picagram: her profile picture, her posts, her references.
  await sql()`update pica_accounts set avatar_media_id = ${newId} where user_id = ${userId} and avatar_media_id = ${old}`;
  await sql()`update pica_accounts set ref_media_ids = array_replace(ref_media_ids, ${old}::uuid, ${newId}::uuid) where user_id = ${userId} and ${old}::uuid = any(ref_media_ids)`;
  await sql()`update pica_posts set media_id = ${newId} where user_id = ${userId} and media_id = ${old}`;
  // 🎭 A character: her references, and her headshot if that's what it was.
  await sql()`update chat_characters set reference_ids = array_replace(reference_ids, ${old}::uuid, ${newId}::uuid), updated_at = now() where ${old}::uuid = any(reference_ids)`;
  if (was?.file_id && m.file_id) await sql()`update chat_characters set portrait_file_id = ${m.file_id}, updated_at = now() where portrait_file_id = ${was.file_id}`;
  // 💬 And wherever it sits in a chat.
  await sql()`update velo_messages set media_id = ${newId} where user_id = ${userId} and media_id = ${old}`;
  await sql()`delete from pica_saved where user_id = ${userId} and media_id = ${old}`;
  await sql()`update velo_media set replaces = null where id = ${newId}`;
  await deleteMedia(userId, old).catch(e => console.error("redo: delete the old one", e instanceof Error ? e.message : e));
  return true;
}
