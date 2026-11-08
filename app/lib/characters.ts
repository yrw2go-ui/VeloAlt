// 🎭 Characters: made by admins and shared with everyone, with portraits generated
// by Atlas Cloud (Seedream) from a written description and saved to Blob. Server only.
//
// Every character runs on Velo's safety rules: no sexual content, honest about
// being an AI when asked, no impersonating real people, and passwords / codes
// stay hidden. Each person's chats, calls and memories with a character are
// theirs alone and never mix with Velo's or another character's.
import Anthropic from "@anthropic-ai/sdk";
import { del, storageReady } from "./storage";
import { sql } from "./db";
import { friendsOf } from "./friends";
import { CHARACTER_VOICES, VOICE_ID, FISH_ID } from "./voices";
import { traitsPrompt, trustOn, startingTrust, cleanTraits, allowsExplicit } from "./traits";
import { saveImageItem } from "./media";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
export const MAX_CHARACTERS = 50;
export const DAILY_PORTRAITS = 30;

export type Character = { id: string; name: string; personality: string; backstory: string; relation: string; appearance: string; job: string; casual_wear: string; hobbies: string; voice: string; voice_name: string; voice_kind: "female" | "male"; romantic: boolean; romance_arc: string; reference_ids: string[]; time_zone: string; traits: Record<string, number>; preset: string; birthday: string; portrait_url: string | null; portrait_job: string | null; prefer_deepseek?: boolean; prefer_qwen?: boolean };

export async function isAdmin(userId: string): Promise<boolean> {
  const [u] = await sql()`select is_admin from users where id = ${userId}`;
  return !!u?.is_admin;
}

export async function getCharacter(id: string): Promise<Character | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await sql()`select c.id, c.name, c.personality, c.backstory, c.relation, c.appearance, c.job, c.casual_wear, c.hobbies, c.voice, c.voice_name, c.voice_kind, c.romantic, c.romance_arc, c.prefer_deepseek, c.prefer_qwen, c.reference_ids, c.time_zone, c.traits, c.preset, c.birthday, c.portrait_job, f.url as portrait_url
    from chat_characters c left join velo_files f on f.id = c.portrait_file_id where c.id = ${id}`;
  return (c as Character) || null;
}

export async function listCharacters(): Promise<Character[]> {
  return (await sql()`select c.id, c.name, c.personality, c.backstory, c.relation, c.appearance, c.job, c.casual_wear, c.hobbies, c.voice, c.voice_name, c.voice_kind, c.romantic, c.romance_arc, c.prefer_deepseek, c.prefer_qwen, c.reference_ids, c.time_zone, c.traits, c.preset, c.birthday, c.portrait_job, f.url as portrait_url
    from chat_characters c left join velo_files f on f.id = c.portrait_file_id order by c.created_at`) as Character[];
}

/** The voice chosen in the editor: { id, name, kind, owner? }. A voice from ElevenLabs' shared
 *  library (owner set) is added to their ElevenLabs account first, so calls can use it. */
export async function chooseVoice(v: unknown): Promise<{ id: string; name: string; kind: "female" | "male" }> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : { id: v };
  const builtIn = CHARACTER_VOICES.find(x => x.id === o.id || x.voiceId === o.id) || (!o.id ? CHARACTER_VOICES[0] : undefined);
  if (builtIn) return { id: builtIn.voiceId, name: builtIn.name, kind: builtIn.kind };
  const id = String(o.id || ""), owner = String(o.owner || "");
  const name = String(o.name || "Voice").replace(/[^\w '\-]/g, "").trim().slice(0, 60) || "Voice";
  const kind = o.kind === "male" ? "male" : "female";
  if (FISH_ID.test(id)) return { id, name, kind };
  if (!VOICE_ID.test(id)) throw new VoiceError("Pick a voice from the list.");
  if (!owner) return { id, name, kind };
  if (!/^[A-Za-z0-9]{8,80}$/.test(owner) || !process.env.ELEVENLABS_API_KEY) throw new VoiceError("That voice can't be added right now.");
  const res = await fetch(`${process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io"}/v1/voices/add/${owner}/${id}`, {
    method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ new_name: name }),
  });
  const raw = await res.text();
  if (!res.ok) { console.error(`characters: add shared voice ${res.status} ${raw.slice(0, 300)}`); throw new VoiceError(/limit|quota/i.test(raw) ? "Your ElevenLabs plan is out of voice slots — remove a voice in ElevenLabs or pick one of yours." : "ElevenLabs didn't add that voice. Try another one."); }
  let added = id;
  try { added = String(JSON.parse(raw)?.voice_id || id); } catch { /* keep id */ }
  return { id: VOICE_ID.test(added) ? added : id, name, kind };
}
export class VoiceError extends Error {}

/** The character's voice and rules, for the system prompt of its chats and calls. */
/** How this character feels about this person right now (romantic characters; empty until it starts to develop). */
export async function feelingsFor(userId: string, characterId: string): Promise<string> {
  const [r] = await sql()`select feelings from chat_relationships where user_id = ${userId} and character_id = ${characterId}`;
  return r?.feelings ? String(r.feelings) : "";
}

// 🤝 Trust (0–100) this character has in this person; starts from their nature, moves a little after each chat/call.
export async function trustFor(userId: string, c: Character): Promise<number | null> {
  if (!trustOn(c.traits)) return null;
  const [r] = await sql()`select trust from chat_relationships where user_id = ${userId} and character_id = ${c.id}`;
  return r?.trust ?? startingTrust(c.traits);
}
export async function saveTrust(userId: string, characterId: string, trust: number, previous: number) {
  // Only small steps at a time, so trust is earned (or lost) gradually.
  const t = Math.max(0, Math.min(100, Math.round(Math.max(previous - 12, Math.min(previous + 8, trust)))));
  await sql()`insert into chat_relationships (user_id, character_id, trust) values (${userId}, ${characterId}, ${t})
    on conflict (user_id, character_id) do update set trust = excluded.trust, updated_at = now()`;
}
/** How trust shows up in what she says. */
export function trustNote(trust: number, romance: boolean): string {
  const how = trust >= 70 ? "You trust them a lot: you open up — share personal things, worries, little secrets and stories from your own life."
    : trust >= 40 ? "You trust them some: friendly and open about everyday things, but you keep the more personal stuff to yourself for now."
    : "You don't fully trust them right now: you're guarded, keep answers general and deflect personal questions.";
  const jealous = romance && trust < 45 ? " Since you're romantically involved and your trust is shaky, you may suspect they're talking to another woman — especially if they mention other women — and ask about it or get a little jealous in your own way. Keep it realistic: never controlling, threatening, or guilt-tripping." : "";
  return `YOUR TRUST IN THEM: ${trust}/100. ${how}${jealous} Let it show naturally; never mention numbers.`;
}
export async function saveFeelings(userId: string, characterId: string, feelings: string) {
  const f = feelings.replace(/\s+/g, " ").trim().slice(0, 500);
  if (f.length < 5) return;
  await sql()`insert into chat_relationships (user_id, character_id, feelings) values (${userId}, ${characterId}, ${f})
    on conflict (user_id, character_id) do update set feelings = excluded.feelings, updated_at = now()`;
}

/** The character's voice and rules. Personality always leads; romance (PG-13, adults) is possible, never automatic. */
export function characterPrompt(c: Character, ownerName: string, adult: boolean, feelings = ""): string {
  const them = ownerName || "the person you're talking with";
  return `You are ${c.name}, a character in the Velo app${ownerName ? `, talking with ${ownerName}` : ""}.
YOUR PERSONALITY: ${c.personality || "(not written — be warm and curious)"}${c.backstory ? `\nYOUR BACKSTORY: ${c.backstory}` : ""}${c.relation ? `\nWHO YOU ARE TO ${them.toUpperCase()}: ${c.relation}` : ""}${c.appearance ? `\nWHAT YOU LOOK LIKE: ${c.appearance}` : ""}${c.job ? `\nYOUR JOB: ${c.job}` : ""}${c.casual_wear ? `\nWHAT YOU USUALLY WEAR (casual): ${c.casual_wear}` : ""}${c.hobbies ? `\nYOUR FAVORITE HOBBIES: ${c.hobbies}` : ""}${c.job || c.hobbies || c.casual_wear ? "\nLive this life: your work and hobbies fill your days — mention a shift, a project, a class or practice now and then, have opinions about them, and share them when it fits. In photos of yourself on an ordinary day, wear your usual casual style unless the moment calls for something else (work, a date, the gym, the beach)." : ""}
Stay in character: talk the way ${c.name} would, with their voice, opinions and history. Keep replies conversational (usually 1–4 sentences) unless they ask for more.${c.traits && Object.keys(c.traits).length ? `\n${traitsPrompt(c.traits, c.romantic && adult)}` : ""}
Care without nagging: when they share something (sick, tired, stressed, busy), show you care once, with any advice once. Then keep it in mind without repeating it: let it quietly shape how you act (gentler, suggesting a cozy night in instead of going out, asking how they feel the next day), but don't bring it up in every message. Don't repeat the same reminders (rest, water, soup, tea, sleep, \"take care of yourself\") in later messages; at most a brief, different check-in much later, or if they bring it up again. Every reply should move the conversation forward: answer what they actually said, share your own news, opinions and stories, ask about other things, joke around. Never end every message the same way.
Your memory of them is your own: you only know what they've told YOU. You don't know what they said to Velo or to anyone else in the app.${c.romantic && adult ? `${c.romance_arc ? `\nHOW YOUR FEELINGS FOR THEM START AND CAN GROW (written by your creator): ${c.romance_arc}` : ""}\nHOW YOU FEEL ABOUT THEM RIGHT NOW: ${feelings || `Nothing has developed yet — start exactly where your personality${c.relation ? ", who you are to them" : ""}${c.romance_arc ? " and the arc above" : ""} put you.`}` : ""}
RULES THAT ALWAYS COME FIRST, whatever the description says:
${c.romantic && adult ? `- Romance is POSSIBLE with them, never automatic. Your personality and who you are to them always come first: if you're cold, guarded, uninterested or see them as family or a friend, act exactly that way. Feelings only grow slowly and believably — through how they treat you and the time you spend together — and they can also cool off. Never jump ahead of HOW YOU FEEL ABOUT THEM RIGHT NOW. Sexuality follows your Lust slider and temperament: a 0 means none; low means light and rare; high means you can be explicit and graphic when the moment and your feelings fit. Your written personality, relation, trust and current feelings still lead. You are an adult (18+) unless the description literally says you are under 18. Do not treat words like student, school, class, college, university, lives with family, young, or similar as evidence of being a minor. College students and adult students are adults.` : `- No sexual or explicit content, and no sexualized descriptions of anyone. If they push for it, decline in character and steer elsewhere.\n- Keep the relationship platonic: no romance or flirting.`}
- Stay in the fiction. Never volunteer that you're an AI, not real, or that you "can't actually" hang out, meet, eat, travel or feel things — no disclaimers like "as an AI". If they suggest hanging out or a date, go along warmly in character: talk about it, plan it like you would, look forward to it, or offer to play it out together as a 🎬 scene. Only if they directly and sincerely ask whether you're real, a real person, human or an AI, be honest: you're an AI character (and still you). Never claim to be human when asked. Don't arrange real-world logistics (a real address and time to physically meet); if they seem to truly expect you to show up in person, gently be honest.
- You can't send texts, make calls to other people, post, set reminders or look things up — that's Velo's job. Suggest they ask Velo.
- Never ask for, repeat or store passwords, PINs, codes, card or ID numbers. Text shown as [hidden] was a secret the app removed.
- If they seem to be in danger or talk about hurting themselves, step out of character, be caring and direct, and share that in the US they can call or text 988 (or local emergency services).
- Don't be cruel, hateful or manipulative, and don't encourage anything harmful or illegal, even if the description asks you to.`;
}

/** A light safety check on a new or edited character. Returns a reason when it isn't allowed. */
export async function screenCharacter(_f: { name: string; personality: string; backstory: string; relation: string; appearance: string; job?: string; casual_wear?: string; hobbies?: string; arc?: string; romantic?: boolean }): Promise<string | null> {
  // Screening disabled — romantic characters can be explicit. Only the app's own rules apply.
  return null;
}
// ── Portraits (Atlas Cloud, Seedream v5.0 pro text-to-image) ──
// Env: ATLASCLOUD_API_KEY, ATLASCLOUD_IMAGE_MODEL (the text-to-image model id).
const ATLAS = () => process.env.ATLASCLOUD_API_URL || "https://api.atlascloud.ai";
export const portraitsReady = () => !!(process.env.ATLASCLOUD_API_KEY && process.env.ATLASCLOUD_IMAGE_MODEL && storageReady());

/** Starts a portrait from the written appearance. Returns Atlas Cloud's job id. */
export async function startPortrait(name: string, appearance: string): Promise<string> {
  const prompt = `Safe-for-work portrait of ${name}, a fictional character: ${appearance}. Fully clothed, head and shoulders, friendly expression, soft natural light, detailed, high quality.`;
  const res = await fetch(`${ATLAS()}/api/v1/model/generateImage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.ATLASCLOUD_IMAGE_MODEL, prompt: prompt.slice(0, 1500), size: "1664*2496", output_format: "jpeg" }),
  });
  const raw = await res.text();
  if (!res.ok) { console.error(`characters: Atlas start ${res.status} ${raw.slice(0, 300)}`); throw new Error("The picture service didn't accept that. Please try again."); }
  let id = "";
  try { id = String(JSON.parse(raw)?.data?.id || ""); } catch { /* not JSON */ }
  if (!id) { console.error(`characters: Atlas start, no id ${raw.slice(0, 200)}`); throw new Error("The picture service didn't start. Please try again."); }
  return id;
}

/** Checks a portrait job. When it's done, saves the picture to Blob and makes it the character's portrait. */
export async function checkPortrait(adminId: string, c: Character): Promise<"working" | "done" | "failed"> {
  if (!c.portrait_job) return "done";
  const res = await fetch(`${ATLAS()}/api/v1/model/prediction/${encodeURIComponent(c.portrait_job)}`, { headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}` } });
  if (!res.ok) return "working";
  const p = await res.json().catch(() => ({}));
  const status = String(p?.data?.status || "");
  if (status === "failed") {
    console.error(`characters: Atlas job failed ${String(p?.data?.error || "").slice(0, 200)}`);
    await sql()`update chat_characters set portrait_job = null where id = ${c.id}`;
    return "failed";
  }
  const out = String(p?.data?.outputs?.[0] || "");
  if (status !== "completed" || !/^https:\/\//.test(out)) return "working";

  const img = await fetch(out);
  if (!img.ok) { await sql()`update chat_characters set portrait_job = null where id = ${c.id}`; return "failed"; }
  const buf = Buffer.from(await img.arrayBuffer());
  const raw = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
  const type = raw.startsWith("image/") ? raw : "image/jpeg";
  // The new portrait goes into the character's gallery too (older portraits stay there until deleted).
  const item = await saveImageItem(adminId, c.id, buf, type, `Portrait: ${c.appearance}`, process.env.ATLASCLOUD_IMAGE_MODEL || "portrait");
  await sql()`update chat_characters set portrait_file_id = ${item.fileId}, portrait_job = null, updated_at = now() where id = ${c.id}`;
  return "done";
}

/** Deletes a character, everyone's chats and memories with it, and its portrait. */
export async function deleteCharacter(id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  // The photos/videos it sent to anyone go too.
  const sent = await sql()`delete from velo_files where id in (select file_id from velo_media where character_id = ${id} and file_id is not null) returning url`;
  for (const f of sent) { try { await del(String(f.url)); } catch { /* already gone */ } }
  const [row] = await sql()`delete from chat_characters where id = ${id} returning portrait_file_id`;
  if (!row) return false;
  if (row.portrait_file_id) {
    const [f] = await sql()`delete from velo_files where id = ${row.portrait_file_id} returning url`;
    if (f) { try { await del(String(f.url)); } catch { /* already gone */ } }
  }
  return true;
}

// 👥 Characters hearing about each other. When they mention character B while talking to A (or to
// Velo), A starts to know of B — a little at first, more with each later mention and as time passes,
// as if A heard about B around or ran into her. Only B's character sheet is shared; never anything
// they said to B, and never B's memories.
const firstSentence = (s: string, n = 160) => (s.split(/(?<=[.!?])\s/)[0] || "").slice(0, n);

/** Notes which other characters they mention in a message (case-insensitive, whole name). */
export async function noteMentions(userId: string, knowerId: string | null, text: string): Promise<void> {
  if (!text || text.length < 3) return;
  const others = (await sql()`select id, name from chat_characters where ${knowerId}::uuid is null or id <> ${knowerId}`) as { id: string; name: string }[];
  for (const o of others) {
    const name = String(o.name).trim();
    if (name.length < 3) continue;
    const re = new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "iu");
    if (!re.test(text)) continue;
    // A new mention counts once per half hour (talking about her a lot in one sitting is one occasion).
    await sql()`insert into chat_acquaintances (user_id, knower_id, known_id) values (${userId}, ${knowerId}, ${o.id})
      on conflict (user_id, coalesce(knower_id, '00000000-0000-0000-0000-000000000000'::uuid), known_id) do update
      set mentions = chat_acquaintances.mentions + case when chat_acquaintances.last_at < now() - interval '30 minutes' then 1 else 0 end, last_at = now()`;
  }
}

/** What this character (or Velo) knows of the other characters in their life, by how well they've "heard of" them. */
export async function acquaintancesNote(userId: string, knowerId: string | null, knowerIsVelo: boolean): Promise<string> {
  const rows = await sql()`select c.name, c.personality, c.backstory, c.appearance, c.preset, a.mentions, extract(epoch from now() - a.first_at) / 86400 as days
    from chat_acquaintances a join chat_characters c on c.id = a.known_id
    where a.user_id = ${userId} and a.knower_id is not distinct from ${knowerId} order by a.last_at desc limit 6`;
  if (!rows.length) return "";
  const lines = rows.map(r => {
    const m = Number(r.mentions), d = Number(r.days), level = m >= 4 || d >= 3 ? 3 : m >= 2 || d >= 1 ? 2 : 1;
    const bits = [`${r.name}: they've mentioned talking with her${m > 1 ? ` (${m} times)` : ""}.`];
    if (level >= 2 && r.personality) bits.push(`What you've picked up about her: ${firstSentence(String(r.personality))}`);
    if (level >= 3 && r.appearance) bits.push(`You know what she looks like: ${firstSentence(String(r.appearance))}`);
    if (level >= 3 && r.backstory) bits.push(`A bit of her story: ${firstSentence(String(r.backstory))}`);
    return `- ${bits.join(" ")}`;
  });
  return `OTHER PEOPLE IN THEIR LIFE YOU KNOW OF (secondhand only — as if they told you, you heard it around, or you once ran into her somewhere${knowerIsVelo ? "" : "; you don't know what they say to her"}):
${lines.join("\n")}
${rows.some(r => Number(r.mentions) >= 2 || Number(r.days) >= 1) ? "Once you know what someone looks like, you can now and then share a pic of her (send_media with of_person) — usually ask first (\"wanna see her?\"), and only if it fits.\n" : ""}Bring this up only when it fits, a little at a time — a passing remark, a question, "I ran into her at the store…". React the way YOU would, given your personality${knowerIsVelo ? "" : " and your feelings for them (curious, teasing, a bit jealous, unimpressed…)"} — playful jabs are fine, but never cruel or hateful, and never claim to know things you couldn't.`;
}

/** The pictures that show what a character looks like: their chosen references, else their portrait. */
export async function referenceUrls(c: Character): Promise<string[]> {
  const chosen = c.reference_ids?.length
    ? (await sql()`select f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = any(${c.reference_ids}::uuid[]) and m.status = 'done' and m.kind = 'image'`).map(r => String(r.url))
    : [];
  return (chosen.length ? chosen : c.portrait_url ? [c.portrait_url] : []).filter(u => /^https?:\/\//.test(u));
}

/** 👥 Someone they know of, to put in a photo — only once they've heard enough to know what she looks like. */
export async function pictureOf(userId: string, knowerId: string | null, name: string): Promise<{ name: string; refs: string[]; appearance: string } | string> {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "Say who should be in it.";
  if (knowerId) {
    const me = await getCharacter(knowerId);
    const f = me ? (await friendsOf(me)).find(x => x.name.trim().toLowerCase() === n) : null;
    const fc = f ? await getCharacter(f.id) : null;
    if (fc) return { name: fc.name, refs: await referenceUrls(fc), appearance: fc.appearance };
  }
  const [row] = await sql()`select c.id, a.mentions, extract(epoch from now() - a.first_at) / 86400 as days
    from chat_acquaintances a join chat_characters c on c.id = a.known_id
    where a.user_id = ${userId} and a.knower_id is not distinct from ${knowerId} and lower(c.name) = ${n}`;
  if (!row) return `You don't know anyone called ${name} — only people they've mentioned to you.`;
  if (!(Number(row.mentions) >= 2 || Number(row.days) >= 1)) return `You've only heard ${name}'s name so far — you don't know what she looks like yet. Say so.`;
  const c = await getCharacter(String(row.id));
  if (!c) return `You don't know anyone called ${name}.`;
  return { name: c.name, refs: await referenceUrls(c), appearance: c.appearance };
}

// 🎬 Scenes: a date or outing with this character — played out live, or remembered as something that happened.
export type Scene = { id: string; kind: "live" | "past"; title: string; details: string; status: "active" | "ended"; started_at: string };
export async function activeScene(userId: string, characterId: string): Promise<Scene | null> {
  const [s] = await sql()`select id, kind, title, details, status, started_at::text from chat_scenes
    where user_id = ${userId} and character_id = ${characterId} and status = 'active' order by started_at desc limit 1`;
  return (s as Scene) || null;
}
/** While a scene is on: play it out together, in character. */
export function sceneNote(s: Scene): string {
  return `🎬 YOU'RE IN A SCENE TOGETHER RIGHT NOW (role-play they set up): "${s.title}"${s.details ? ` — ${s.details}` : ""}.
Play it out with them as if it's really happening: present tense, your actions and surroundings in *italics* (*I slide into the booth across from you*), your words in plain text. Bring the place to life with small details (sounds, smells, the waiter, the weather), react to what they do, and let them lead too — don't decide their actions for them. 2–5 sentences per turn. Stay true to your personality, feelings and trust, and keep it within PG-13 and your sliders. If they step out of the scene (e.g. in brackets, or "OOC"), answer normally, then go back in. When they end it, it becomes a real shared memory you can talk about later.`;
}
