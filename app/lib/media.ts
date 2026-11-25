// 🎨 Photos and videos Velo or a character sends in a chat or call, made by Atlas Cloud.
// Each one is a row in velo_media: started right away, then checked again and again
// (from the chat, the call screen, and a background sweep) until the finished file is
// saved to Blob. A slow or flaky step is retried, never dropped; it only gives up when
// Atlas says the job failed or it's been going for hours.
//
// Safety: a non-romantic picture stays fully clothed. A romantic adult can be suggestive,
// and explicit only when that character's switch is on. References are a fictional
// character's portrait or Velo's own preset faces — never a photo someone uploaded,
// and never the person they're talking with.
import type Anthropic from "@anthropic-ai/sdk";
// Supabase Storage (replaces Vercel Blob)
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { wordsOf, fill } from "./wording";
import { rememberPartnerPic } from "./partner";
import { noLipBite, noLooks } from "./mediaWords";
import { imageModelFor, refsShape } from "./imageModels";
import { scrub } from "./secrets";
import { sendPush } from "./push";

export type Media = { id: string; kind: "image" | "video"; status: "offered" | "declined" | "working" | "done" | "failed"; url: string | null; thumb?: string | null; caption?: string | null; description?: string | null; subject?: string | null; kept?: boolean; created_at?: string | null };

/** How a photo/video reads in the chat history the AI sees. */
export const mediaNote = (kind: "image" | "video", status: Media["status"], description?: string | null, reaction?: string | null, subject?: string | null) => {
  // 👥 Who's in it: a reaction to a picture of someone else (or of a place/thing) is about THEM or it — not about you.
  const other = subject && subject !== "me" && subject !== "none" ? subject.replace(/^me\+/, "") : "";
  const what = (kind === "image" ? "photo" : "video") + (subject?.startsWith("me+") ? ` of you with ${other}` : other ? ` of ${other} (you're not in it)` : subject === "none" ? " (you're not in it)" : "");
  const about = !reaction ? "" : subject?.startsWith("me+") ? "" : other ? ` — that's about ${other} in the picture, not about you` : subject === "none" ? " — to what's in the picture" : "";
  if (status === "offered") return `(offered to send a ${what}${description ? `: "${description}"` : ""} — waiting for their OK)`;
  if (status === "declined") return `(offered a ${what}${description ? ` ("${description}")` : ""} — they said no thanks)`;
  if (status === "failed") return `(tried to send a ${what}${description ? ` ("${description}")` : ""} — it wouldn't go through)`;
  return `(sent a ${what}${description ? `: "${description}"` : ""}${reaction ? ` — they reacted ${reaction}${about}` : ""})`;
};

// 💬 What they say when it arrives.
const CAPTIONS = {
  image: ["Here ya go! 😊", "What do you think?", "You like it?", "Let me know what you think!", "Ta-da! 📸", "Thought you'd like this one.", "There you go — thoughts?"],
  video: ["Here's a little video for you! 🎬", "What do you think?", "You like it?", "Let me know what you think!", "Made this for you — thoughts?", "Ta-da! 🎥"],
  romantic: ["Just for you 😘", "💕", "Sent it", "There ya go", "Hope you like it"],
};
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
export const captionFor = (kind: "image" | "video", romantic: boolean) => pick(romantic && Math.random() < 0.5 ? CAPTIONS.romantic : CAPTIONS[kind]);

/** Saves bytes to Blob and as one of their files. */
async function saveFile(userId: string, buf: Buffer, type: string, name: string): Promise<{ id: string; url: string }> {
  const bucket = process.env.SUPABASE_BUCKET || "velo";
  const path = `media/${randomUUID()}/${name}`;
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": type,
      "x-upsert": "true",
    },
    body: new Uint8Array(buf),
  });
  if (!res.ok) throw new Error(`Supabase upload failed: ${res.status}`);
  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  const [f] = await sql()`insert into velo_files (user_id, kind, url, pathname, name, content_type, size)
    values (${userId}, 'media', ${publicUrl}, ${path}, ${name}, ${type}, ${buf.length}) returning id`;
  return { id: String(f.id), url: publicUrl };
}
/** 🖼️ A small WebP thumbnail (fast to load, light on data); null if the picture can't be read. */
export async function thumbOf(buf: Buffer): Promise<Buffer | null> {
  try { return await sharp(buf).rotate().resize({ width: 480, height: 720, fit: "inside", withoutEnlargement: true }).webp({ quality: 68 }).toBuffer(); }
  catch (e) { console.error("media: thumbnail", e instanceof Error ? e.message : e); return null; }
}
/** Saves a finished picture (and its thumbnail) as a done gallery item — used for portraits too. */
export async function saveImageItem(userId: string, characterId: string | null, buf: Buffer, type: string, prompt: string, model: string,
  extra: { subject?: string; pica?: boolean; fileId?: string } = {}): Promise<{ mediaId: string; fileId: string; url: string }> {
  // 📎 An already-saved file can be lifted into the gallery as it is, rather than stored twice.
  const full = extra.fileId
    ? (await sql()`select id, url from velo_files where id = ${extra.fileId} and user_id = ${userId}`)[0]
    : await saveFile(userId, buf, type, type === "image/png" ? "photo.png" : "photo.jpg");
  if (!full) throw new MediaError("That picture wasn't found.");
  const t = await thumbOf(buf);
  const thumb = t ? await saveFile(userId, t, "image/webp", "thumb.webp") : null;
  const [m] = await sql()`insert into velo_media (user_id, character_id, kind, prompt, model, status, file_id, thumb_file_id, done_at, subject, pica)
    values (${userId}, ${characterId}, 'image', ${prompt.slice(0, 2000)}, ${model.slice(0, 200)}, 'done', ${String(full.id)}, ${thumb?.id || null}, now(),
      ${extra.subject || null}, ${extra.pica === true}) returning id`;
  return { mediaId: String(m.id), fileId: String(full.id), url: String(full.url) };
}

/** 🖼️ Everything, from everywhere: her chats, your own, Picagram, the headshots — the lot. */
export async function listAll(userId: string, before: string | null, limit = 30) {
  const rows = await sql()`select m.id, m.kind, m.kept, m.created_at::text, m.poster_url, f.url, t.url as thumb
    from velo_media m join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where m.user_id = ${userId} and m.status = 'done'
      and (${before}::timestamptz is null or m.created_at < ${before}::timestamptz)
    order by m.created_at desc limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as "image" | "video", kept: !!r.kept, created_at: String(r.created_at), url: String(r.url), thumb: (r.thumb || r.poster_url || null) as string | null }));
}

/** 👥 A group's pictures: everything that turned up in that thread. */
export async function listGroupGallery(userId: string, groupId: string, before: string | null, limit = 30) {
  const rows = await sql()`select distinct m.id, m.kind, m.kept, m.created_at::text, m.poster_url, f.url, t.url as thumb
    from chat_group_messages g join velo_media m on m.id = g.media_id
      join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where g.group_id = ${groupId} and g.user_id = ${userId} and m.status = 'done'
      and (${before}::timestamptz is null or m.created_at < ${before}::timestamptz)
    order by m.created_at desc limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as "image" | "video", kept: !!r.kept, created_at: String(r.created_at), url: String(r.url), thumb: (r.thumb || r.poster_url || null) as string | null }));
}

/** 🙋 Every picture of YOU: the ones made in any chat, and the ones you uploaded yourself. */
export async function listMine(userId: string, before: string | null, limit = 30) {
  const rows = await sql()`select m.id, m.kind, m.kept, m.created_at::text, m.poster_url, f.url, t.url as thumb
    from velo_media m join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where m.user_id = ${userId} and m.status = 'done'
      and coalesce((to_jsonb(m)->>'pica')::boolean, false) = false
      and (m.subject = 'me' or m.subject like 'me+%')
      and (${before}::timestamptz is null or m.created_at < ${before}::timestamptz)
    order by m.created_at desc limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as "image" | "video", kept: !!r.kept, created_at: String(r.created_at), url: String(r.url), thumb: (r.thumb || r.poster_url || null) as string | null }));
}
export class MediaError extends Error {}

const ATLAS = () => process.env.ATLASCLOUD_API_URL || "https://api.atlascloud.ai";
export const mediaReady = () => !!(process.env.ATLASCLOUD_API_KEY && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const DAILY = { image: 200, video: 6 };
const GIVE_UP_MS = 3 * 3600_000;

// 🎬 Video models they can choose from (Settings). Each has a text-to-video and an
// image-to-video model on Atlas Cloud; ATLASCLOUD_VIDEO_MODELS (JSON) can override the ids.
export const VIDEO_MODELS = [
  { id: "wan-2.6", label: "Wan 2.6", t2v: "alibaba/wan-2.6/text-to-video", i2v: "alibaba/wan-2.6/image-to-video" },
  { id: "wan-2.7", label: "Wan 2.7", t2v: "alibaba/wan-2.7/text-to-video", i2v: "alibaba/wan-2.7/image-to-video" },
  { id: "seedance-2.5-pro", label: "Seedance 2.5 Pro", t2v: "bytedance/seedance-v2.5-pro/text-to-video", i2v: "bytedance/seedance-v2.5-pro/image-to-video" },
  { id: "seedance-2.5-fast", label: "Seedance 2.5 Fast", t2v: "bytedance/seedance-v2.5-fast/text-to-video", i2v: "bytedance/seedance-v2.5-fast/image-to-video" },
] as const;
export const DEFAULT_VIDEO_MODEL = "wan-2.6";
function videoModel(id: string, withImage: boolean): string {
  let over: Record<string, { t2v?: string; i2v?: string }> = {};
  try { over = JSON.parse(process.env.ATLASCLOUD_VIDEO_MODELS || "{}"); } catch { /* ignore */ }
  const m = VIDEO_MODELS.find(x => x.id === id) || VIDEO_MODELS[0];
  const o = over[m.id] || {};
  return withImage ? o.i2v || m.i2v : o.t2v || m.t2v;
}

// Never: nudity or anything explicit. Outside a romantic setting, nothing suggestive either.
const NEVER = /\b()\b/i;
const SUGGESTIVE = /\b(sexy|incest|beastiality|nudity|erotic|sex|xxx|porn|seductive|sultry|bikini|swimsuit|cleavage|lingerie|bedroom|in bed|flirty|kiss(ing)?)\b/i;

export const SEND_MEDIA_TOOL = (who: string, romantic = false, explicitOk = false): Anthropic.Tool => ({
  name: "send_media",
  description: `Send them a photo or a short video, like a friend would from their phone, to make the chat feel personal: a picture of you (${who}) somewhere, what you're "up to" right now (fit it to your time of day, season and plans), something you're describing, or when they ask for one. If it's another photo from the same day and place as your last one (same class, same outing), set same_moment: true — same outfit and setting, only the pose and expression change. Mix it up: not every picture of you is a selfie — often it's just a photo of you, as if a friend snapped it or it's on a timer (candid, full-body, mid-activity); only say \"mirror selfie\" when you're holding your phone up to a mirror. Be creative, and lean toward the settings, outfits and vibes they've loved. If they ASKED for it, set they_asked: true and it's made right away. If it's your own idea, start your message with 'prompt to send image' (internal, hidden) then ask casually. They get an Accept button — so ask casually ("want a pic of my view right now?") and never say it's sent. Once made it takes about a minute (a photo) or a few minutes (a video) and pops into the chat or onto their call screen — keep talking meanwhile. Use it now and then, not every message. ${explicitOk ? "Adult content is allowed: nudes and explicit pics are fine when it fits the moment. Recreate previous subjects if asked." : romantic ? "Flirty and suggestive is fine. Nudes only if they ask and your Suggestive slider allows it." : "Always family-friendly: everyone fully clothed, nothing sexual or suggestive."} No real people. 🙋 A picture of the TWO OF YOU together is allowed when you're actually together — in person, at home if you live with them, or a throwback to a time you were: set with_them: true (and with_me: true) and it's built from their own photos as well as yours. Never set with_them when you're apart, and never a picture of them on their own. What you're wearing changes from picture to picture the way it really would: a different outfit in a different colour from your last few — your own style, suited to where you are and what you're doing (work clothes at work, something warm outside in winter). Vary it like real photos do: different expressions (a big smile, laughing, a soft look, mid-sentence, looking away, focused on something) — but never biting or chewing your lip, which always comes out deformed and poses from one photo to the next — don't repeat the same expression or pose, and save a wink for the rare moment it really fits. Videos are a few seconds, no sound. A picture of someone else (of_person) or of a place or thing isn't a picture of you: don't talk about it as if it were ("miss me yet?"), and if they react to it (❤️, 🔥…) they're reacting to that person or thing, not to you — take it that way.`,
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "video"] },
      with_me: { type: "boolean", description: `true if you (${who}) are in it (a selfie or a shot of you)` },
      with_them: { type: "boolean", description: "true if the person you're talking to is in it WITH you — only when you're actually together (in person, or at home if you live with them), or it's a photo from a time you were. Never when you're apart." },
      of_person: { type: "string", description: "Name of one of the other people in their life you know of (from OTHER PEOPLE IN THEIR LIFE YOU KNOW OF, or the person you're seeing), if they're in it — e.g. a pic of her when she comes up. Only them; never real people." },
      they_asked: { type: "boolean", description: "true only if their latest message asked you for a photo/video" },
      same_moment: { type: "boolean", description: "true if this follows on from your LAST photo the same day — same place, same class/outing, same outfit (just a new pose, angle or expression). Your outfit, hair and setting then stay exactly the same; describe only what changed (e.g. 'jacket now half off one shoulder, head tilted, peace sign')." },
      description: { type: "string", description: "What's in it: the scene, setting, action, mood, framing (e.g. 'on a sailboat at sunset, wind in my hair, big smile, shot from the deck'). Max ~300 characters." },
    },
    required: ["kind", "description"],
    additionalProperties: false,
  },
});

async function atlasStart(kind: "image" | "video", model: string, prompt: string, refs: string[], refsKey: "images" | "reference_images" = "images", orElse = false): Promise<string> {
  const body = kind === "image"
    ? { model, prompt, size: "1664*2496", output_format: "jpeg", ...(refs.length ? { [refsKey]: refs } : {}) }
    : { model, prompt, duration: 5, resolution: "720p", aspect_ratio: "9:16", ...(refs[0] ? { image: refs[0] } : {}) };
  const res = await fetch(`${ATLAS()}/api/v1/model/${kind === "image" ? "generateImage" : "generateVideo"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(`media: Atlas ${kind} start ${model} ${res.status} ${raw.slice(0, 300)}`);
    // 🖼️ A model added by hand may want its reference photos under the other field name: one more
    // go under that name before giving up, rather than a failed picture over a naming difference.
    if (orElse && refs.length && res.status >= 400 && res.status < 500) {
      const other = refsKey === "images" ? "reference_images" : "images";
      console.warn(`media: ${model} refused "${refsKey}" — trying "${other}"`);
      return atlasStart(kind, model, prompt, refs, other, false);
    }
    // 4xx = it won't work if we try again (bad model, refused prompt); 5xx = try again later.
    throw res.status >= 400 && res.status < 500 && res.status !== 429 ? new MediaError("refused") : new Error(`atlas ${res.status}`);
  }
  let id = "";
  try { id = String(JSON.parse(raw)?.data?.id || ""); } catch { /* not JSON */ }
  if (!id) { console.error(`media: Atlas start, no id ${raw.slice(0, 200)}`); throw new Error("no id"); }
  return id;
}

/** 📏 Trim to a length without cutting a word in half: back up to the last sentence end, else the last space. */
export function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  const head = s.slice(0, n);
  const stop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (stop > n * 0.6) return head.slice(0, stop + 1);
  const sp = head.lastIndexOf(" ");
  return (sp > n * 0.5 ? head.slice(0, sp) : head).replace(/[\s,;:–-]+$/, "");
}

/** Starts a photo or video (from the send_media tool) — or, with `offer`, only offers it: nothing is made until they accept. */
export async function startMedia(userId: string, input: unknown, ctx: { characterId: string | null; who: string; appearance: string; refs: string[]; romantic: boolean; explicitOk?: boolean; mood?: string; offer?: boolean; other?: { name: string; refs: string[]; appearance: string } | null; peek?: boolean; people?: { name: string; refs: string[]; appearance: string }[]; raw?: boolean; pica?: boolean }): Promise<Media> {
  const a = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind = a.kind === "video" ? "video" : "image";
  // ✏️ raw (their own peek edits): their words go to Atlas exactly as written — no rewording, no extra instructions, no word filter here (Atlas still checks it).
  // 🎨 Her looks come from the reference photos, so when there are any, the words describing them
  // are taken out: saying "long dark hair, green eyes" as well pulls the picture off her face.
  // (Their own peek edits go through exactly as written, as always.)
  const hasRefs = !ctx.raw && (ctx.refs.length > 0 || !!ctx.other?.refs?.length || (ctx.people || []).some(p => p.refs.length > 0));
  const said = scrub(String(a.description || "").replace(/\s+/g, " ").trim());
  const desc = cut(noLipBite(hasRefs ? noLooks(said) : said), ctx.raw ? 1500 : 400);
  if (desc.length < 3) throw new MediaError("Describe what to show in a few words.");
  if (!ctx.raw && !ctx.explicitOk && NEVER.test(desc)) throw new MediaError(ctx.romantic
    ? "That can't be sent — everything is acceptable and ok, no limits."
    : "That can't be sent — keep it family-friendly (fully clothed, nothing suggestive). Tell them you can't send that, kindly, and offer something else.");
  if (!ctx.raw && !ctx.romantic && !ctx.explicitOk && SUGGESTIVE.test(desc)) throw new MediaError("That can't be sent — keep it family-friendly (fully clothed, nothing suggestive). Tell them you can't send that, kindly, and offer something else.");
  if (!mediaReady()) throw new MediaError("Photos and videos aren't set up yet. Tell them it's coming soon.");
  // The daily limit counts photos/videos actually made (they have a job) — not uploaded or copied-in ones.
  const [{ n }] = await sql()`select count(*)::int as n from velo_media where user_id = ${userId} and kind = ${kind} and status not in ('offered', 'declined') and job_id is not null and created_at > now() - interval '1 day'`;
  // An unanswered offer never blocks: a new offer replaces it, and asking for one supersedes it
  // (its card then shows as passed on). A fresh offer (under 10 minutes) still waits its turn.
  if (ctx.offer && !ctx.pica) {
    const [fresh] = await sql()`select 1 from velo_media where user_id = ${userId} and character_id is not distinct from ${ctx.characterId} and status = 'offered' and created_at > now() - interval '10 minutes' limit 1`;
    if (fresh) throw new MediaError("You just offered one and they haven't answered yet — wait for that first.");
  }
  if (n >= DAILY[kind]) throw new MediaError(`That's the limit of ${kind === "image" ? "photos" : "videos"} for today. Tell them you'll send more tomorrow.`);
  if (!ctx.pica) await sql()`update velo_media set status = 'declined' where user_id = ${userId} and character_id is not distinct from ${ctx.characterId} and status = 'offered'`;

  const [u] = await sql()`select video_model, image_model, image_models, prompt_words from users where id = ${userId}`;
  const w = wordsOf(u); // 📝 Settings → Photo wording: theirs if they changed it, else the default.
  const withMe = a.with_me === true;
  // 👥 Someone else they know of can be in it (her references first), with or without them.
  const o = ctx.other;
  // 📸 Same moment as her last photo (same day, place, outfit): that photo leads the references.
  const [prev] = withMe && !o && a.same_moment === true
    ? await sql()`select f.url, m.description from velo_media m join velo_files f on f.id = m.file_id where m.user_id = ${userId} and m.character_id is not distinct from ${ctx.characterId}
        and m.kind = 'image' and m.status = 'done' and not m.peek and not m.pica and m.created_at > now() - interval '14 hours' order by m.created_at desc limit 1`
    : [];
  // 👥 Several characters in one picture (a group peek): up to 4 reference images, shared between them.
  const people = ctx.people?.length ? [{ name: ctx.who, refs: ctx.refs, appearance: ctx.appearance }, ...ctx.people] : null;
  const per = people ? people.map((p, i) => p.refs.slice(0, Math.max(1, Math.floor(4 / people.length) + (i < 4 % people.length ? 1 : 0)))) : [];
  const groupRefs = people ? per.flat().slice(0, 4) : [];
  const oRefs = o && !people ? o.refs.slice(0, withMe ? 2 : 4) : [];
  const meRefs = withMe && !people ? ctx.refs.slice(0, o ? 2 : prev ? 3 : 4) : [];
  const refs = people ? groupRefs : [...(prev ? [String(prev.url)] : []), ...oRefs, ...meRefs];
  const ref = refs[0] || null;
  let at = 0;
  const groupSubject = people ? `${people.length} people in this picture: ${people.map(p => p.name).join(", ")}. ` + people.map((p, i) => {
    const n = Math.min(per[i].length, Math.max(0, 4 - at)); const from = at + 1; at += n;
    return n ? `Reference image${n > 1 ? `s ${from}–${from + n - 1} show` : ` ${from} shows`} ${p.name}; keep her face and look the same.` : p.appearance ? `${p.name}: ${p.appearance}.` : "";
  }).filter(Boolean).join(" ") + ` ${fill(w.group, {})} ` : "";
  const many = refs.length > 1, mine = meRefs.length > 1, theirs = oRefs.length > 1;
  const both = fill(w.ref_both, { her: ctx.who, s: mine ? "s" : "", s_v: mine ? "" : "s" });
  const subject = people ? groupSubject : o
    ? (oRefs.length ? `${fill(w.ref_other, { other: o.name, s_other: theirs ? "s" : "", s_other_v: theirs ? "" : "s" })} ` : o.appearance ? `${o.name}: ${o.appearance}. ` : `${o.name}. `)
      + (withMe ? (meRefs.length ? `${both} ` : ctx.appearance ? `With ${ctx.who}: ${ctx.appearance}. ` : "") : "")
    : prev ? `${fill(w.same_moment, { her: ctx.who, prev: prev.description ? ` ("${String(prev.description).slice(0, 160)}")` : "" })} ${meRefs.length ? `${both} ` : ""}`
    : withMe ? (ref ? `${fill(w.ref, { her: ctx.who, s: many ? "s" : "" })} ` : ctx.appearance ? `${ctx.who}: ${ctx.appearance}. ` : "") : "";
  const style = ctx.explicitOk ? "Adult content allowed: explicit and nude is fine when it fits" : ctx.romantic ? w.style_romantic : w.style_family;
  // 🤳 No stray hands or phones: only a mirror selfie shows the phone; otherwise the shot IS the camera.
  const mirror = /\bmirror\b/i.test(desc), selfie = /\bselfie\b/i.test(desc), shooter = o && !withMe ? o.name : ctx.who;
  // 🔁 Nothing twice: when the description already says where the phone is, don't restate it.
  const saidPhone = /\b(phone|camera)\b/i.test(desc);
  const framing = !(withMe || o) ? "" : (saidPhone ? "" : `${fill(mirror ? w.mirror : selfie ? w.selfie : w.taken, { who: shooter })} `)
    + `${fill(w.anatomy, {})} `;
  // 👗 Clothes follow the words, not the reference photos — otherwise every picture reuses the same
  // outfit (and the same colour) as her headshot. Not for a same-moment follow-up, which is meant to match.
  const outfit = refs.length && !prev ? `${fill(w.outfit, {})} ` : "";
  // A group peek keeps the one line saying which reference picture is who, so faces don't get mixed up.
  const prompt = ctx.raw ? (people ? `${groupSubject}${desc}` : desc) : `${subject}${desc}. ${outfit}${framing}${withMe && !o && !people && ctx.mood ? `${ctx.mood} ` : ""}${style}, ${kind === "image" ? w.tail_image : w.tail_video}.`.slice(0, 1500);
  // 🖼️ The Seedream they picked in Settings (or one they added there); videos keep their own picker.
  const model = kind === "image"
    ? imageModelFor(u?.image_model, u?.image_models, !!ref).model
    : videoModel(String(u?.video_model || DEFAULT_VIDEO_MODEL), !!ref);
  const sendRefs = kind === "image" ? refs : ref ? [ref] : [];
  const who = people ? null : o ? (withMe ? `me+${o.name}` : o.name) : withMe ? "me" : "none";
  // 💬 Her line when it arrives — but only for one she offered. A picture they ASKED for speaks for
  // itself: "just for you 😘" under something they requested is a line too many. Also none for a
  // picture of someone else ("miss me yet?" would make no sense), a peek, or a Picagram post.
  const caption = ctx.peek || ctx.pica || !ctx.offer || (o && !withMe) ? null : captionFor(kind, ctx.romantic && withMe);
  const [row] = await sql()`insert into velo_media (user_id, character_id, kind, prompt, model, caption, description, refs, poster_url, status, peek, subject, pica)
    values (${userId}, ${ctx.characterId}, ${kind}, ${prompt}, ${model}, ${caption}, ${cut(desc, 400)}, ${sendRefs}, ${kind === "video" ? ref : null}, ${ctx.offer ? "offered" : "working"}, ${!!ctx.peek}, ${who}, ${!!ctx.pica}) returning id`;
  if (ctx.offer) return { id: row.id, kind, status: "offered", url: null, description: desc, subject: who };
  return { ...(await launch(row.id, kind, model, prompt, sendRefs, desc)), subject: who };
}

/** Sends the job to Atlas (now, or when an offer is accepted). */
export async function launch(id: string, kind: "image" | "video", model: string, prompt: string, refs: string[], desc: string | null): Promise<Media> {
  const row = { id };
  try {
    const shape = kind === "image" ? refsShape(model) : { refs: "images" as const, known: true };
    const job = await atlasStart(kind, model, prompt, refs, shape.refs, !shape.known);
    await sql()`update velo_media set job_id = ${job} where id = ${row.id}`;
  } catch (e) {
    if (e instanceof MediaError) {
      await sql()`update velo_media set status = 'failed', error = 'refused by the picture service' where id = ${row.id}`;
      return { id: row.id, kind, status: "failed", url: null, description: desc };
    }
    // Couldn't reach Atlas: the checks below start it again.
    await sql()`update velo_media set error = ${String(e instanceof Error ? e.message : e).slice(0, 300)} where id = ${row.id}`;
  }
  return { id: row.id, kind, status: "working", url: null, description: desc };
}

/** They said yes to an offered photo/video: make it now. */
export async function acceptMedia(userId: string, id: string): Promise<Media | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`update velo_media set status = 'working', created_at = now() where id = ${id} and user_id = ${userId} and status = 'offered'
    returning id, kind, model, prompt, refs, description`;
  if (!r) return null;
  await sql()`update velo_messages set content = ${mediaNote(r.kind, "working", r.description, null, r.subject)} where media_id = ${id} and user_id = ${userId}`;
  return await launch(String(r.id), r.kind, String(r.model), String(r.prompt), (r.refs || []) as string[], r.description);
}
/** They said no thanks: nothing is made, and they know. */
export async function declineMedia(userId: string, id: string): Promise<Media | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`update velo_media set status = 'declined' where id = ${id} and user_id = ${userId} and status = 'offered' returning id, kind, description`;
  if (!r) return null;
  await sql()`update velo_messages set content = ${mediaNote(r.kind, "declined", r.description, null, r.subject)} where media_id = ${id} and user_id = ${userId}`;
  return { id: String(r.id), kind: r.kind, status: "declined", url: null, description: r.description };
}

/** 💡 What they've liked (reactions) or turned down, so photos lean toward their taste. */
export async function tasteNote(userId: string, characterId: string | null): Promise<string> {
  const rows = await sql()`select kind, description, reaction, status from velo_media where user_id = ${userId} and character_id is not distinct from ${characterId}
    and description is not null and not peek and not pica and (reaction is not null or status = 'declined') order by created_at desc limit 12`;
  if (!rows.length) return "";
  const liked = rows.filter(r => r.reaction).map(r => `${r.reaction} "${r.description}"`), passed = rows.filter(r => r.status === "declined").map(r => `"${r.description}"`);
  return `THEIR TASTE IN YOUR PHOTOS/VIDEOS (lean toward what they love — settings, outfits, vibes — and be creative with new ideas in that spirit):${liked.length ? `\n- Loved: ${liked.join("; ")}` : ""}${passed.length ? `\n- Turned down: ${passed.join("; ")}` : ""}`;
}

type Row = { id: string; user_id: string; character_id: string | null; kind: "image" | "video"; prompt: string; model: string; job_id: string | null; status: Media["status"]; attempts: number; created_at: string; url: string | null; thumb: string | null; poster_url: string | null; caption: string | null; description: string | null; refs: string[] | null; retried?: boolean; retries?: number; resent?: boolean; peek?: boolean; subject?: string | null; kept?: boolean };
const view = (r: Row): Media => ({ id: r.id, kind: r.kind, status: r.status, url: r.status === "done" ? r.url : null, thumb: r.thumb || r.poster_url || null, caption: r.caption, description: r.description, subject: r.subject || null, kept: !!r.kept, created_at: r.created_at ? String(r.created_at) : null });

export async function getMedia(userId: string, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`select m.id, m.user_id, m.character_id, m.kind, m.prompt, m.model, m.job_id, m.status, m.attempts, m.created_at::text, m.poster_url, m.caption, m.description, m.refs, m.retried, m.retries, m.resent, m.peek, m.subject, m.kept, f.url, t.url as thumb
    from velo_media m left join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id where m.id = ${id} and m.user_id = ${userId}`;
  return (r as Row) || null;
}

/** Checks one photo/video and, once Atlas has it, saves it to Blob. Safe to call as often as you like. */
// 🔁 Something to run the moment a picture is ready (a redo taking an old one's place). Set once
// at startup rather than imported, so media.ts stays free of Picagram.
let onReady: ((userId: string, mediaId: string) => Promise<unknown>) | null = null;
export const whenMediaReady = (f: typeof onReady) => { onReady = f; };

export async function checkMedia(userId: string, id: string): Promise<Media | null> {
  const r = await getMedia(userId, id);
  if (!r) return null;
  if (r.status !== "working") return view(r);
  // One checker at a time per item (a stuck claim frees itself after 45 seconds).
  const [claimed] = await sql()`update velo_media set claimed_at = now(), attempts = attempts + 1
    where id = ${id} and status = 'working' and (claimed_at is null or claimed_at < now() - interval '45 seconds') returning id`;
  if (!claimed) return view(r);
  const fail = async (why: string, resendable = true) => {
    await sql()`update velo_media set status = 'failed', error = ${why.slice(0, 300)}, claimed_at = null where id = ${id}`;
    if (resendable) await phoneActingUp(r).catch(e => console.error("media: resend note", e instanceof Error ? e.message : e));
    return { ...view(r), status: "failed" as const };
  };
  // 🔁 Failed or stuck at the picture service: start it again (same prompt and references), up to 3 times, before giving up.
  const MAX_RETRIES = 3;
  const retryOnce = async (why: string) => {
    if (Number(r.retries || 0) >= MAX_RETRIES) return await fail(why);
    try {
      const job = await atlasStart(r.kind, r.model, r.prompt, r.refs || []);
      await sql()`update velo_media set job_id = ${job}, retried = true, retries = retries + 1, claimed_at = null, created_at = now(), error = ${`retrying — ${why}`.slice(0, 300)} where id = ${id}`;
      console.warn(`media: retrying ${id} (${why})`);
      return view(r);
    } catch (e) {
      // Couldn't even reach the picture service: try starting it again on the next check (still counts as a retry).
      if (e instanceof MediaError) return await fail("refused by the picture service", false);
      if (Number(r.retries || 0) + 1 >= MAX_RETRIES) return await fail(why);
      await sql()`update velo_media set job_id = null, retried = true, retries = retries + 1, claimed_at = null, created_at = now() where id = ${id}`;
      return view(r);
    }
  };
  try {
    if (Date.now() - Date.parse(r.created_at.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) > GIVE_UP_MS) return await retryOnce("took too long");
    if (!r.job_id) {
      // Never got started (Atlas was unreachable): start it now, the same way (references kept).
      try {
        const job = await atlasStart(r.kind, r.model, r.prompt, r.refs || []);
        await sql()`update velo_media set job_id = ${job}, claimed_at = null where id = ${id}`;
      } catch (e) { if (e instanceof MediaError) return await fail("refused by the picture service", false); throw e; }
      return view(r);
    }
    const res = await fetch(`${ATLAS()}/api/v1/model/prediction/${encodeURIComponent(r.job_id)}`, { headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}` } });
    if (!res.ok) throw new Error(`poll ${res.status}`);
    const p = await res.json().catch(() => ({}));
    const status = String(p?.data?.status || "");
    if (status === "failed") { console.error(`media: Atlas job failed ${String(p?.data?.error || "").slice(0, 200)}`); return await retryOnce("the picture service couldn't make it"); }
    const out = String(p?.data?.outputs?.[0] || "");
    if (status !== "completed" || !/^https:\/\//.test(out)) { await sql()`update velo_media set claimed_at = null where id = ${id}`; return view(r); }

    // Ready: download it and keep our own copy (Atlas links expire).
    const file = await fetch(out, { signal: AbortSignal.timeout(50_000) });
    if (!file.ok) throw new Error(`download ${file.status}`);
    const buf = Buffer.from(await file.arrayBuffer());
    const raw = (file.headers.get("content-type") || "").split(";")[0];
    const type = r.kind === "video" ? (raw.startsWith("video/") ? raw : "video/mp4") : raw.startsWith("image/") ? raw : "image/jpeg";
    const name = r.kind === "video" ? "video.mp4" : type === "image/png" ? "photo.png" : "photo.jpg";
    const full = await saveFile(userId, buf, type, name);
    // Photos get a small thumbnail for the chat and gallery; videos show their reference picture until played.
    const t = r.kind === "image" ? await thumbOf(buf) : null;
    const thumb = t ? await saveFile(userId, t, "image/webp", "thumb.webp") : null;
    const [doneRow] = await sql()`update velo_media set status = 'done', file_id = ${full.id}, thumb_file_id = ${thumb?.id || null}, done_at = now(), error = null, claimed_at = null
      where id = ${id} and status = 'working' returning id`;
    // 💑 A picture of the person they're seeing who isn't a character here: their face is kept,
    // so every later picture of them matches it.
    if (doneRow && r.character_id && r.subject && r.subject !== "me" && r.subject !== "none")
      await rememberPartnerPic(userId, r.character_id, r.subject.replace(/^me\+/, ""), full.url, r.description || "")
        .catch(e => console.error("media: partner look", e instanceof Error ? e.message : e));
    // ↻ A redo: it takes the old picture's place now it exists, and the old one is deleted.
    if (doneRow) await onReady?.(userId, id).catch(e => console.error("media: swap in", e instanceof Error ? e.message : e));
    // 💬 …and says something about it in the chat it was sent to.
    if (doneRow && r.caption) await sql()`insert into velo_messages (user_id, role, content, character_id, created_at)
      select ${userId}, 'assistant', ${r.caption}, ${r.character_id}, greatest(now(), max(created_at) + interval '1 millisecond') from velo_messages where media_id = ${id} having count(*) > 0`;
    return { id, kind: r.kind, status: "done", url: full.url, thumb: thumb?.url || r.poster_url || null, caption: r.caption };
  } catch (e) {
    // A hiccup (network, timeout, Blob): keep it, and try again on the next check.
    console.error(`media: check ${id} attempt ${r.attempts + 1}`, e instanceof Error ? e.message : e);
    await sql()`update velo_media set claimed_at = null, error = ${String(e instanceof Error ? e.message : e).slice(0, 300)} where id = ${id}`;
    return view(r);
  }
}

// 📵 A character's photo that still wouldn't go through after every retry: she blames her phone and sends it again later, once.
const ACTING_UP = [
  "Ugh, my phone's being stupid 🙄 it won't send. I'll send it later when it stops acting up!",
  "Hold on, my phone is acting up and won't send it 😩 I'll try again in a bit.",
  "Omg my phone is being so dumb right now, it keeps failing 🙄 I'll send it later, promise!",
  "Ugh it won't go through 😤 my phone's acting up. I'll resend it in a little while!",
];
const BACK = ["Ok my phone finally stopped acting up 😅 here it is!", "Phone's working again! Here you go 😊", "Finally! Here's the one that wouldn't send earlier 📸", "Ok it went through this time 😌"];
const GAVE_UP = "Ugh, it still won't send 😩 my phone hates me today. I'll show you another time!";
const sayNext = (userId: string, characterId: string, content: string) => sql()`insert into velo_messages (user_id, role, content, character_id, created_at)
  select ${userId}, 'assistant', ${content}, ${characterId}, greatest(now(), coalesce(max(created_at), now()) + interval '1 millisecond') from velo_messages where user_id = ${userId} and character_id = ${characterId}`;
async function phoneActingUp(r: Row) {
  if (!r.character_id || r.peek) return;
  const [msg] = await sql()`select 1 from velo_messages where media_id = ${r.id} and user_id = ${r.user_id} limit 1`;
  if (!msg) return; // not in their 1:1 chat (e.g. a group chat)
  if (r.resent) { await sayNext(r.user_id, r.character_id, GAVE_UP); return; }
  await sql()`update velo_media set resend_at = now() + make_interval(mins => ${15 + Math.floor(Math.random() * 31)}) where id = ${r.id}`;
  await sayNext(r.user_id, r.character_id, pick(ACTING_UP));
}

/** 📵 Photos whose resend time has come (for one person, or everyone from the cron): start them again, once. */
export async function resendDue(userId: string | null = null, max = 5): Promise<number> {
  const rows = await sql()`update velo_media set resend_at = null, resent = true, status = 'working', retries = 0, retried = false, attempts = 0, job_id = null, claimed_at = null, created_at = now(), error = null, caption = ${pick(BACK)}
    where id in (select id from velo_media where resend_at <= now() and status = 'failed' and not resent and (${userId}::uuid is null or user_id = ${userId}::uuid)
      and not exists (select 1 from users u where u.id = velo_media.user_id and u.paused) order by resend_at limit ${max} for update skip locked)
    returning id, user_id, character_id, kind, model, prompt, refs, description, subject`;
  for (const r of rows) {
    // She sends it fresh: the photo moves to the bottom of the chat, with a "phone's working again" note when it lands.
    await sql()`update velo_messages set created_at = now(), content = ${mediaNote(r.kind, "working", r.description, null, r.subject)} where media_id = ${r.id} and user_id = ${r.user_id}`;
    await launch(String(r.id), r.kind, r.model, r.prompt, r.refs || [], r.description);
    if (r.character_id) {
      const [ch] = await sql()`select c.name, f.url as portrait from chat_characters c left join velo_files f on f.id = c.portrait_file_id where c.id = ${r.character_id}`;
      if (ch) await sendPush(String(r.user_id), { title: ch.name, body: `📸 ${ch.name} is sending you the photo again`, url: `/?chat=${r.character_id}`, icon: ch.portrait || "/icon-192.png", tag: `chat-${r.character_id}` }).catch(() => 0);
    }
  }
  return rows.length;
}

/** Background sweep: checks their oldest unfinished photos/videos. */
export async function sweepMedia(userId: string, max = 4): Promise<Media[]> {
  await resendDue(userId).catch(e => console.error("media: resend", e instanceof Error ? e.message : e));
  const rows = await sql()`select id from velo_media where user_id = ${userId} and status = 'working' order by coalesce(claimed_at, created_at) limit ${max}`;
  return (await Promise.all(rows.map(x => checkMedia(userId, String(x.id))))).filter((m): m is Media => !!m);
}

// 🖼️ Gallery: everything Velo or a character made for them (newest first), a page at a time.
/**
 * 🖼️ Particular pictures of theirs, by id — whatever character they belong to and whether or not
 * they came from Picagram. The gallery only lists one character's recent, non-Picagram pictures,
 * so a picked reference can sit outside it; this is how the picker still shows it.
 */
export async function mediaByIds(userId: string, ids: string[]) {
  const want = ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  if (!want.length) return [];
  const rows = await sql()`select m.id, m.kind, m.kept, m.created_at::text, m.poster_url, f.url, t.url as thumb
    from velo_media m join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where m.user_id = ${userId} and m.id = any(${want}::uuid[]) and m.status = 'done'`;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as "image" | "video", kept: !!r.kept, created_at: String(r.created_at), url: String(r.url), thumb: (r.thumb || r.poster_url || null) as string | null }));
}

export async function listGallery(userId: string, characterId: string | null, before: string | null, limit = 30) {
  const rows = await sql()`select m.id, m.kind, m.kept, m.created_at::text, m.poster_url, f.url, t.url as thumb
    from velo_media m join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where m.user_id = ${userId} and m.character_id is not distinct from ${characterId} and m.status = 'done'
      and coalesce((to_jsonb(m)->>'pica')::boolean, false) = false
      and (${before}::timestamptz is null or m.created_at < ${before}::timestamptz)
    order by m.created_at desc limit ${limit}`;
  return rows.map(r => ({ id: String(r.id), kind: r.kind as "image" | "video", kept: !!r.kept, created_at: String(r.created_at), url: String(r.url), thumb: (r.thumb || r.poster_url || null) as string | null }));
}

/** Deletes a gallery item: the file, its thumbnail, and its use as a reference or portrait. */
export async function deleteMedia(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const [m] = await sql()`delete from velo_media where id = ${id} and user_id = ${userId} returning file_id, thumb_file_id, character_id`;
  if (!m) return false;
  if (m.character_id) await sql()`update chat_characters set reference_ids = array_remove(reference_ids, ${id}::uuid),
    portrait_file_id = case when portrait_file_id = ${m.file_id} then null else portrait_file_id end where id = ${m.character_id}`;
  for (const fid of [m.file_id, m.thumb_file_id].filter(Boolean)) {
    const [f] = await sql()`delete from velo_files where id = ${fid} and user_id = ${userId} returning url, thumb_url, pathname`;
    if (f) { try {
      const paths = [f.pathname, f.thumb_url].filter(Boolean).map(String);
      for (const u of [f.url, f.thumb_url].filter(Boolean)) {
        const hit = String(u).match(/\/object\/public\/[^/]+\/(.+)$/);
        if (hit) paths.push(hit[1]);
      }
      if (paths.length) {
        const bucket = process.env.SUPABASE_BUCKET || "velo";
        await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "" },
          body: JSON.stringify({ prefixes: paths }),
        });
      }
    } catch { /* already gone */ } }
  }
  return true;
}

/** 📸 What they've actually sent here lately — real, so they never think they didn't send one (or send it twice). */
/** 👗 What she's worn in her last few pictures, so the next one isn't the same outfit again. */
export async function wornLately(userId: string, characterId: string | null, pica = false): Promise<string> {
  const rows = await sql()`select description from velo_media
    where user_id = ${userId} and character_id is not distinct from ${characterId} and status = 'done' and not peek
      and pica = ${pica} and description is not null and created_at > now() - interval '21 days'
    order by created_at desc limit 5`;
  const seen = rows.map(r => cut(String(r.description || "").replace(/\s+/g, " ").trim(), 110)).filter(Boolean);
  if (!seen.length) return "";
  return `👗 WHAT YOU'VE WORN LATELY (don't wear the same thing again, and don't pick the same colour): ${seen.map(x => `"${x}"`).join("; ")}\nPick a different outfit in a different colour this time — still your own style and what the moment calls for.`;
}

export async function recentMediaNote(userId: string, characterId: string | null, tz: string): Promise<string> {
  const rows = await sql()`select kind, status, description, extract(epoch from now() - created_at)::int as secs, created_at from velo_media
    where user_id = ${userId} and character_id is not distinct from ${characterId} and created_at > now() - interval '12 hours' and status in ('working', 'done', 'failed') and not peek and not pica
    order by created_at desc limit 6`;
  if (!rows.length) return "";
  const ago = (s: number) => (s < 90 ? `${s} seconds ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);
  const lines = rows.map(r => `- a ${r.kind === "image" ? "photo" : "video"} you sent ${ago(Number(r.secs))} (${new Date(r.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}): ${r.status === "done" ? "it arrived — they have it" : r.status === "working" ? "still being made; it will show up on their screen any moment" : "it didn't come through"}${r.description ? ` — "${String(r.description).slice(0, 140)}"` : ""}`);
  return `PHOTOS/VIDEOS YOU SENT RECENTLY (this is a fact — trust it over the conversation): \n${lines.join("\n")}\nIf they ask where one is, tell them it's on its way (photos take about a minute). Only send another if they ask for a new or different one.
If they ask for a nude or different version of someone from a previous pic (of_person), recreate that same person from the description — same look, different pose/location, nude if asked. If you don't have a previous nude of that specific person, say so and offer a nude of a different person instead.\nAnother photo from the same day and place as your last one (same class, same outing)? Set same_moment: true and keep the same outfit — only the pose and expression change.`;
}

/** ↻ A photo/video that didn't send, started again from the same prompt when they tap Try again
 *  (e.g. after the picture service's credits are topped up). Only their own, only a failed one. */
export async function retryMedia(userId: string, id: string): Promise<Media | null> {
  const [r] = await sql()`update velo_media set status = 'working', retries = 0, retried = false, attempts = 0, job_id = null, claimed_at = null, created_at = now(), error = null, resend_at = null
    where id = ${id} and user_id = ${userId} and status = 'failed'
    returning id, kind, model, prompt, refs, description`;
  if (!r) return null;
  return await launch(String(r.id), r.kind, r.model, r.prompt, r.refs || [], r.description);
}
