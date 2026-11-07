// 👀 Scene peeks: during a live scene, "*peek*" shows a photo of the moment — the place, her outfit
// for the outing, what she's doing right now — as if they were standing there looking. She never
// knows: no reply, and the peek and its picture are left out of everything she reads.
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { type Character, referenceUrls, type Scene } from "./characters";
import { startMedia, type Media } from "./media";
import { allowsSuggestive, mediaMood } from "./traits";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
export const PEEK = /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i;

/** What the camera would see right now, written from the scene so far. */
async function describeMoment(ch: Character, scene: Scene, lines: { role: string; content: string }[], romantic: boolean): Promise<string> {
  const transcript = lines.map(l => `${l.role === "assistant" ? ch.name : "Them"}: ${l.content}`).join("\n").slice(-4000);
  const res = await client.messages.create({
    model: process.env.VELO_MODEL!,
    max_tokens: 300,
    system: `You write the description for ONE photo for an image generator. ${ch.name} and the person are out together (the scene below). The person is quietly looking at her right now — the photo is exactly what they see from where they are: they are behind the camera and NOT in the picture. Describe ${ch.name} in this exact moment: where they are (the place, time of day, lighting), what she is wearing for this outing (from the scene, or what fits it and her usual style${ch.casual_wear ? `: ${ch.casual_wear}` : ""}), what she is doing, her pose and expression — either candid and unaware, or glancing at them. ${romantic ? "PG-13 at most: flattering and flirty is fine, never nudity, underwear or anything sexual." : "Family-friendly, fully clothed."} One or two sentences, under 300 characters, no names of real people, output only the description.`,
    messages: [{ role: "user", content: `SCENE: ${scene.title}${scene.details ? ` — ${scene.details}` : ""}\nHER LOOK: ${ch.appearance || "(see reference pictures)"}\n\nTHE SCENE SO FAR:\n${transcript || "(it just started)"}` }],
  });
  const text = res.content.map(b => (b.type === "text" ? b.text : "")).join(" ").replace(/\s+/g, " ").trim();
  return text.slice(0, 380) || `${ch.name} during ${scene.title}, candid, natural light`;
}

export async function peekAt(userId: string, ch: Character, scene: Scene, adult: boolean): Promise<{ media: Media; userMsgId: string; mediaMsgId: string }> {
  const lines = (await sql()`select role, content from velo_messages where user_id = ${userId} and character_id = ${ch.id} and scene_id = ${scene.id} and not peek
    order by created_at desc limit 16`).reverse().map(r => ({ role: String(r.role), content: String(r.content) }));
  const romantic = adult && !!ch.romantic && allowsSuggestive(ch.traits);
  const description = await describeMoment(ch, scene, lines, romantic);
  const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description },
    { characterId: ch.id, who: ch.name, appearance: ch.appearance, refs: await referenceUrls(ch), romantic, mood: mediaMood(ch.traits), offer: false, other: null, peek: true });
  const [mine] = await sql()`insert into velo_messages (user_id, role, content, character_id, scene_id, peek) values (${userId}, 'user', '*peek*', ${ch.id}, ${scene.id}, true) returning id`;
  const [pic] = await sql()`insert into velo_messages (user_id, role, content, media_id, character_id, scene_id, peek, created_at)
    values (${userId}, 'assistant', '(peek)', ${media.id}, ${ch.id}, ${scene.id}, true, now() + interval '5 milliseconds') returning id`;
  return { media, userMsgId: String(mine.id), mediaMsgId: String(pic.id) };
}
