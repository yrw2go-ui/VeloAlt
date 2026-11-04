// 🎨 Photos and videos Velo or a character sends in a chat or call, made by Atlas Cloud.
// Each one is a row in velo_media: started right away, then checked again and again
// (from the chat, the call screen, and a background sweep) until the finished file is
// saved to Blob. A slow or flaky step is retried, never dropped; it only gives up when
// Atlas says the job failed or it's been going for hours.
//
// Safety: everything is family-friendly and fully clothed; only fictional characters
// (from their portrait) or Velo's own preset faces are used as references — never a
// photo someone uploaded, and never the person they're talking with.
import type Anthropic from "@anthropic-ai/sdk";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { sql } from "./db";
import { scrub } from "./secrets";

export type Media = { id: string; kind: "image" | "video"; status: "working" | "done" | "failed"; url: string | null };
export class MediaError extends Error {}

const ATLAS = () => process.env.ATLASCLOUD_API_URL || "https://api.atlascloud.ai";
export const mediaReady = () => !!(process.env.ATLASCLOUD_API_KEY && process.env.BLOB_READ_WRITE_TOKEN);
const IMAGE_MODEL = () => process.env.ATLASCLOUD_IMAGE_MODEL || "bytedance/seedream-v5.0-pro/text-to-image";
const EDIT_MODEL = () => process.env.ATLASCLOUD_IMAGE_EDIT_MODEL || "bytedance/seedream-v5.0-pro/edit";
export const DAILY = { image: 30, video: 6 };
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

const BLOCK = /\b(nude|naked|nsfw|sex|sexy|sexual|lingerie|topless|bottomless|underwear|bikini|porn|erotic|explicit|strip(ping)?|undress(ed|ing)?|seductive|fetish|onlyfans)\b/i;

export const SEND_MEDIA_TOOL = (who: string): Anthropic.Tool => ({
  name: "send_media",
  description: `Send them a photo or a short video, like a friend would from their phone, to make the chat feel personal: a selfie of you (${who}) somewhere, what you're "up to", something you're describing, or when they ask for one. It's made in the background (a photo takes about half a minute, a video a few minutes) and pops into the chat or onto their call screen when ready — keep talking meanwhile; say something like "sending you a pic" and never claim it's already there. Use it now and then, not every message. Always family-friendly: everyone fully clothed, nothing sexual or suggestive, no real people, and never a picture of the person you're talking with. Videos are a few seconds, no sound.`,
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "video"] },
      with_me: { type: "boolean", description: `true if you (${who}) are in it (a selfie or a shot of you)` },
      description: { type: "string", description: "What's in it: the scene, setting, action, mood, framing (e.g. 'selfie on a sailboat at sunset, wind in my hair, big smile'). Max ~300 characters." },
    },
    required: ["kind", "description"],
    additionalProperties: false,
  },
});

async function atlasStart(kind: "image" | "video", model: string, prompt: string, ref: string | null): Promise<string> {
  const body = kind === "image"
    ? { model, prompt, size: "1664*2496", output_format: "jpeg", ...(ref ? { images: [ref] } : {}) }
    : { model, prompt, duration: 5, resolution: "720p", aspect_ratio: "9:16", ...(ref ? { image: ref } : {}) };
  const res = await fetch(`${ATLAS()}/api/v1/model/${kind === "image" ? "generateImage" : "generateVideo"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error(`media: Atlas ${kind} start ${model} ${res.status} ${raw.slice(0, 300)}`);
    // 4xx = it won't work if we try again (bad model, refused prompt); 5xx = try again later.
    throw res.status >= 400 && res.status < 500 && res.status !== 429 ? new MediaError("refused") : new Error(`atlas ${res.status}`);
  }
  let id = "";
  try { id = String(JSON.parse(raw)?.data?.id || ""); } catch { /* not JSON */ }
  if (!id) { console.error(`media: Atlas start, no id ${raw.slice(0, 200)}`); throw new Error("no id"); }
  return id;
}

/** Starts a photo or video (from the send_media tool). Returns it as "working". */
export async function startMedia(userId: string, input: unknown, ctx: { characterId: string | null; who: string; appearance: string; ref: string | null }): Promise<Media> {
  const a = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const kind = a.kind === "video" ? "video" : "image";
  const desc = scrub(String(a.description || "").replace(/\s+/g, " ").trim().slice(0, 400));
  if (desc.length < 3) throw new MediaError("Describe what to show in a few words.");
  if (BLOCK.test(desc)) throw new MediaError("That can't be sent — keep it family-friendly (fully clothed, nothing suggestive). Tell them you can't send that, kindly, and offer something else.");
  if (!mediaReady()) throw new MediaError("Photos and videos aren't set up yet. Tell them it's coming soon.");
  const [{ n }] = await sql()`select count(*)::int as n from velo_media where user_id = ${userId} and kind = ${kind} and created_at > now() - interval '1 day'`;
  if (n >= DAILY[kind]) throw new MediaError(`That's the limit of ${kind === "image" ? "photos" : "videos"} for today. Tell them you'll send more tomorrow.`);

  const withMe = a.with_me === true;
  const ref = withMe ? ctx.ref : null;
  const subject = withMe ? (ref ? `The person in the reference image is ${ctx.who}; keep their face, hair and look exactly the same. ` : ctx.appearance ? `${ctx.who}: ${ctx.appearance}. ` : "") : "";
  const prompt = `${subject}${desc}. Family-friendly, everyone fully clothed, natural and realistic${kind === "image" ? " photo, candid phone-camera feel" : " video, smooth natural motion"}.`.slice(0, 1500);
  const [u] = await sql()`select video_model from users where id = ${userId}`;
  const model = kind === "image" ? (ref ? EDIT_MODEL() : IMAGE_MODEL()) : videoModel(String(u?.video_model || DEFAULT_VIDEO_MODEL), !!ref);
  const [row] = await sql()`insert into velo_media (user_id, character_id, kind, prompt, model) values (${userId}, ${ctx.characterId}, ${kind}, ${prompt}, ${model}) returning id`;
  try {
    const job = await atlasStart(kind, model, prompt, ref);
    await sql()`update velo_media set job_id = ${job} where id = ${row.id}`;
  } catch (e) {
    if (e instanceof MediaError) {
      await sql()`update velo_media set status = 'failed', error = 'refused by the picture service' where id = ${row.id}`;
      return { id: row.id, kind, status: "failed", url: null };
    }
    // Couldn't reach Atlas: the checks below start it again.
    await sql()`update velo_media set error = ${String(e instanceof Error ? e.message : e).slice(0, 300)} where id = ${row.id}`;
  }
  return { id: row.id, kind, status: "working", url: null };
}

type Row = { id: string; user_id: string; character_id: string | null; kind: "image" | "video"; prompt: string; model: string; job_id: string | null; status: Media["status"]; attempts: number; created_at: string; url: string | null };
const view = (r: Row): Media => ({ id: r.id, kind: r.kind, status: r.status, url: r.status === "done" ? r.url : null });

export async function getMedia(userId: string, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await sql()`select m.id, m.user_id, m.character_id, m.kind, m.prompt, m.model, m.job_id, m.status, m.attempts, m.created_at::text, f.url
    from velo_media m left join velo_files f on f.id = m.file_id where m.id = ${id} and m.user_id = ${userId}`;
  return (r as Row) || null;
}

/** Checks one photo/video and, once Atlas has it, saves it to Blob. Safe to call as often as you like. */
export async function checkMedia(userId: string, id: string): Promise<Media | null> {
  const r = await getMedia(userId, id);
  if (!r) return null;
  if (r.status !== "working") return view(r);
  // One checker at a time per item (a stuck claim frees itself after 45 seconds).
  const [claimed] = await sql()`update velo_media set claimed_at = now(), attempts = attempts + 1
    where id = ${id} and status = 'working' and (claimed_at is null or claimed_at < now() - interval '45 seconds') returning id`;
  if (!claimed) return view(r);
  const fail = async (why: string) => { await sql()`update velo_media set status = 'failed', error = ${why.slice(0, 300)}, claimed_at = null where id = ${id}`; return { ...view(r), status: "failed" as const }; };
  try {
    if (Date.now() - Date.parse(r.created_at.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) > GIVE_UP_MS) return await fail("took too long");
    if (!r.job_id) {
      // Never got started (Atlas was unreachable): start it now. (Restarts are text-only.)
      try {
        const job = await atlasStart(r.kind, r.model.endsWith("/edit") ? IMAGE_MODEL() : r.model.replace("image-to-video", "text-to-video"), r.prompt.replace(/^The person in the reference image is [^;]+; keep their face, hair and look exactly the same\. /, ""), null);
        await sql()`update velo_media set job_id = ${job}, claimed_at = null where id = ${id}`;
      } catch (e) { if (e instanceof MediaError) return await fail("refused by the picture service"); throw e; }
      return view(r);
    }
    const res = await fetch(`${ATLAS()}/api/v1/model/prediction/${encodeURIComponent(r.job_id)}`, { headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}` } });
    if (!res.ok) throw new Error(`poll ${res.status}`);
    const p = await res.json().catch(() => ({}));
    const status = String(p?.data?.status || "");
    if (status === "failed") { console.error(`media: Atlas job failed ${String(p?.data?.error || "").slice(0, 200)}`); return await fail("the picture service couldn't make it"); }
    const out = String(p?.data?.outputs?.[0] || "");
    if (status !== "completed" || !/^https:\/\//.test(out)) { await sql()`update velo_media set claimed_at = null where id = ${id}`; return view(r); }

    // Ready: download it and keep our own copy (Atlas links expire).
    const file = await fetch(out, { signal: AbortSignal.timeout(50_000) });
    if (!file.ok) throw new Error(`download ${file.status}`);
    const buf = Buffer.from(await file.arrayBuffer());
    const raw = (file.headers.get("content-type") || "").split(";")[0];
    const type = r.kind === "video" ? (raw.startsWith("video/") ? raw : "video/mp4") : raw.startsWith("image/") ? raw : "image/jpeg";
    const name = r.kind === "video" ? "video.mp4" : type === "image/png" ? "photo.png" : "photo.jpg";
    const blob = await put(`velo/media/${randomUUID()}/${name}`, buf, { access: "public", addRandomSuffix: true, contentType: type });
    const [f] = await sql()`insert into velo_files (user_id, kind, url, pathname, name, content_type, size)
      values (${userId}, 'media', ${blob.url}, ${blob.pathname}, ${name}, ${type}, ${buf.length}) returning id`;
    await sql()`update velo_media set status = 'done', file_id = ${f.id}, done_at = now(), error = null, claimed_at = null where id = ${id}`;
    return { id, kind: r.kind, status: "done", url: blob.url };
  } catch (e) {
    // A hiccup (network, timeout, Blob): keep it, and try again on the next check.
    console.error(`media: check ${id} attempt ${r.attempts + 1}`, e instanceof Error ? e.message : e);
    await sql()`update velo_media set claimed_at = null, error = ${String(e instanceof Error ? e.message : e).slice(0, 300)} where id = ${id}`;
    return view(r);
  }
}

/** Background sweep: checks their oldest unfinished photos/videos. */
export async function sweepMedia(userId: string, max = 4): Promise<Media[]> {
  const rows = await sql()`select id from velo_media where user_id = ${userId} and status = 'working' order by coalesce(claimed_at, created_at) limit ${max}`;
  return (await Promise.all(rows.map(x => checkMedia(userId, String(x.id))))).filter((m): m is Media => !!m);
}
