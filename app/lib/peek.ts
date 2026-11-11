// 👀 Scene peeks: during a live scene, "*peek*" shows a photo of the moment — the place, her outfit
// for the outing, what she's doing right now — as if they were standing there looking. She never
// knows: no reply, and the peek and its picture are left out of everything she reads.
// Two steps: the description is shown first so they can fix it, then exactly that is made.
import { sql } from "./db";
import { type Character, referenceUrls, type Scene } from "./characters";
import { startMedia, type Media } from "./media";
import { allowsSuggestive, mediaMood } from "./traits";
import { scrub } from "./secrets";
import { writeText } from "./llm";
import { sceneTime } from "./sceneClock";
import { isValidTimeZone } from "./localTime";

export const PEEK = /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i;

/** What the camera would see right now, written from the whole scene so far. Her outfit stays the
 *  same all scene (starting from the last peek), with only the changes that happened since. */
async function describeMoment(ch: Character, scene: Scene, lines: { role: string; content: string; peek?: boolean }[], romantic: boolean, lastPeek: string, time: string): Promise<string> {
  const all = lines.map(l => (l.peek ? "— (your last peek was here) —" : `${l.role === "assistant" ? ch.name : "Them"}: ${l.content}`)).join("\n");
  const transcript = all.length > 12000 ? "…" + all.slice(-12000) : all;
  const raw = await writeText(ch.brain, `You write the description for ONE photo for an image generator. ${ch.name} and the person are out together (the scene below). The person is quietly looking at her right now — the photo is exactly what they see from where they are: they are behind the camera and NOT in the picture. Describe ${ch.name} in this exact moment: where they are (the place, time of day, lighting), what she is wearing, what she is doing, her pose and expression — either candid and unaware, or glancing at them.
OUTFIT CONTINUITY: she wears ONE outfit for the whole scene. ${lastPeek ? "Start from exactly what she wore in THE LAST PEEK" : `Start from the outfit in the scene's details or what she said she's wearing (else what fits the outing and her usual style${ch.casual_wear ? `: ${ch.casual_wear}` : ""})`}, then apply only the changes that actually happened in the scene, in order${lastPeek ? " (especially after the last peek)" : ""}: took off a jacket → no jacket from then on, until she puts it back on; same for shoes, a hat, glasses, hair up or down, a spill, getting wet. Keep every other detail identical — the same colors, items and accessories. Nothing changes just because time passed. The same goes for the place: stay where the scene says they are now.
${romantic ? "Tasteful and PG-13: flattering and flirty is fine; she's dressed (or in swimwear at the beach or pool)." : "Family-friendly, fully clothed."} One or two sentences, under 300 characters, no names of real people, output only the description.`, `SCENE: ${scene.title}${scene.details ? ` — ${scene.details}` : ""}\nTIME IN THE SCENE: ${time} (match the light and sky to it)\nHER LOOK: ${ch.appearance || "(see reference pictures)"}${lastPeek ? `\nTHE LAST PEEK: ${lastPeek}` : ""}\n\nTHE SCENE SO FAR:\n${transcript || "(it just started)"}`, 300);
  const text = raw.replace(/\s+/g, " ").trim();
  // If no AI could write it, still give them something real to edit: the scene's own details, outfit and time.
  return text.slice(0, 380) || sceneFallback(ch.name, scene.title, scene.details, time, lastPeek);
}

/** Step 1: the description of the moment, for them to check (and tweak) before anything is made. */
export async function draftPeek(userId: string, ch: Character, scene: Scene, adult: boolean): Promise<string> {
  const rows = (await sql()`select msg.role, msg.content, msg.peek, m.description from velo_messages msg left join velo_media m on m.id = msg.media_id
    where msg.user_id = ${userId} and msg.character_id = ${ch.id} and msg.scene_id = ${scene.id} and (not msg.peek or (msg.media_id is not null and m.status = 'done'))
    order by msg.created_at desc limit 120`).reverse();
  const lastPeek = String([...rows].reverse().find(r => r.peek)?.description || "");
  // Only the latest peek marks a spot in the transcript; older ones don't matter.
  const lastIdx = rows.map(r => !!r.peek).lastIndexOf(true);
  const lines = rows.filter((r, i) => !r.peek || i === lastIdx).map(r => ({ role: String(r.role), content: String(r.content), peek: !!r.peek }));
  const [u] = await sql()`select time_zone from users where id = ${userId}`;
  const time = sceneTime(scene, isValidTimeZone(u?.time_zone) ? u.time_zone : "America/Chicago").label;
  return describeMoment(ch, scene, lines, romanticFor(ch, adult), lastPeek, time);
}

const romanticFor = (ch: Character, adult: boolean) => adult && !!ch.romantic && allowsSuggestive(ch.traits);

/** Step 2: make the picture from their (possibly edited) description, with her chosen reference pictures. */
export async function peekAt(userId: string, ch: Character, scene: Scene | null, adult: boolean, description: string): Promise<{ media: Media; userMsgId: string; mediaMsgId: string }> {
  const romantic = romanticFor(ch, adult);
  const desc = scrub(description.replace(/\s+/g, " ").trim()).slice(0, 400);
  const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: desc },
    { characterId: ch.id, who: ch.name, appearance: ch.appearance, refs: await referenceUrls(ch), romantic, mood: mediaMood(ch.traits), offer: false, other: null, peek: true });
  const [mine] = await sql()`insert into velo_messages (user_id, role, content, character_id, scene_id, peek) values (${userId}, 'user', '*peek*', ${ch.id}, ${scene.id}, true) returning id`;
  const [pic] = await sql()`insert into velo_messages (user_id, role, content, media_id, character_id, scene_id, peek, created_at)
    values (${userId}, 'assistant', '(peek)', ${media.id}, ${ch.id}, ${scene.id}, true, now() + interval '5 milliseconds') returning id`;
  return { media, userMsgId: String(mine.id), mediaMsgId: String(pic.id) };
}

/** A peek description built straight from the scene (when no AI could write one). */
export function sceneFallback(who: string, title: string, details: string, time: string, lastPeek = ""): string {
  if (lastPeek) return `${lastPeek.replace(/\.$/, "")} — ${time.split(" — ")[1] || time}, candid, glancing at the camera`.slice(0, 380);
  return `${who} during ${title}${details ? `: ${details.replace(/\.$/, "")}` : ""}. ${time.split(" — ")[1] || time} light, candid, glancing at the camera`.slice(0, 380);
}

/** ICU: together in person (no scene). Description of what they see right now. */
export async function draftIcu(userId: string, ch: Character, adult: boolean): Promise<string> {
  const rows = (await sql()`select role, content from velo_messages where user_id = ${userId} and character_id = ${ch.id} and scene_id is null and not peek order by created_at desc limit 40`).reverse();
  const [u] = await sql()`select time_zone from users where id = ${userId}`;
  const tz = isValidTimeZone(u?.time_zone) ? u.time_zone : "America/Chicago";
  const now = new Date();
  const p = { hour: now.getHours(), year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const time = `${p.hour}:00`;
  const [together] = await sql()`select place from chat_in_person where user_id = ${userId} and character_id = ${ch.id}`;
  const lastLook = String((await sql()`select m.description from velo_messages msg join velo_media m on m.id = msg.media_id where msg.user_id = ${userId} and msg.character_id = ${ch.id} and msg.peek and m.status = 'done' order by msg.created_at desc limit 1`)[0]?.description || "");
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const hm = `${String(p.hour).padStart(2,"0")}:00`;
  const atWork = !!(ch.work_attire && ch.work_start && ch.work_end && (ch.work_days || []).includes(dow) && hm >= ch.work_start && hm < ch.work_end);
  const romantic = adult && !!ch.romantic && allowsSuggestive(ch.traits);
  const transcript = rows.map(r => `${r.role === "assistant" ? ch.name : "Them"}: ${r.content}`).join("\n");
  const raw = await writeText(ch.brain, `You write the description for ONE photo for an image generator. The person is with ${ch.name} in person right now (not a planned outing — just together, wherever the chat says they are) and is looking at her: the photo is exactly what they see from where they are; they are behind the camera and NOT in the picture. Describe ${ch.name} in this exact moment: where they are (the place, time of day, lighting), what she is wearing, what she is doing, her pose and expression — candid and unaware, or glancing at them.
WHERE: what the recent chat says (her place, his place, the car, a store…); if it doesn't say, somewhere that fits the time of day and her life.
OUTFIT: ${lastLook ? "exactly what she wore in THE LAST LOOK (same colors and items), plus only changes the chat mentions since" : `what she said she's wearing, else ${atWork ? `her work clothes (${ch.work_attire})` : `what fits the time and place in her usual style${ch.casual_wear ? ` (${ch.casual_wear})` : ""}`}`}.
One or two sentences, under 300 characters, no names of real people, output only the description.`,
    `${together?.place ? `WHERE YOU ARE TOGETHER: ${together.place}\n` : ""}TIME NOW: ${time} (match the light and sky to it)${atWork ? `\nSHE'S AT WORK HOURS (${ch.job || "work"})` : ""}\nHER LOOK: ${ch.appearance || "(see reference pictures)"}${lastLook ? `\nTHE LAST LOOK: ${lastLook}` : ""}\n\nRECENT CHAT:\n${transcript.slice(-8000) || "(nothing yet)"}`, 300);
  const text = raw.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 380);
  const outfit = lastLook ? "" : atWork ? `, in her work clothes (${ch.work_attire})` : ch.casual_wear ? `, wearing ${ch.casual_wear}` : "";
  return lastLook ? `${lastLook.replace(/\.$/, "")} — candid, glancing at the camera` : `${ch.name} right here with me${outfit}. candid, glancing at the camera`;
}
