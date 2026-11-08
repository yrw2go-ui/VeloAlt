// 👀 Scene peeks: during a live scene, "*peek*" shows a photo of the moment —
// the place, her outfit, what she's doing right now — as if they were standing
// there looking. She never knows: no reply, and the peek is left out of
// everything she reads.
import { sql } from "./db";
import { type Character, referenceUrls, type Scene } from "./characters";
import { startMedia, type Media } from "./media";
import { allowsExplicit, mediaMood } from "./traits";
import { provider } from "./models";
import { oaChat } from "./openai";

export const PEEK = /^\s*\*?\s*pe(e|a)k\s*\*?\s*[.!]?\s*$/i;

/** What the camera would see right now, written from the scene so far. Uses the character's preferred model. */
async function describeMoment(ch: Character, scene: Scene, lines: { role: string; content: string }[], spicy: boolean): Promise<string> {
  const transcript = lines.map(l => `${l.role === "assistant" ? ch.name : "Them"}: ${l.content}`).join("\n").slice(-4000);
  const p = (ch.prefer_deepseek && provider("deepseek")) || (ch.prefer_qwen && provider("qwen")) || provider("deepseek") || provider("qwen");
  const system = `You write the description for ONE photo for an image generator. ${ch.name} and the person are out together (the scene below). The person is quietly looking at her right now — the photo is exactly what they see from where they are: they are behind the camera and NOT in the picture. Describe ${ch.name} in this exact moment: where they are, the lighting that matches the time of day in the scene (night scene = night lighting, streetlights, dark sky; day scene = daylight; evening = dusk), what she is wearing for this outing (from the scene, or what fits it and her usual style${ch.casual_wear ? `: ${ch.casual_wear}` : ""}), what she is doing, her pose and expression — either candid and unaware, or glancing at them as if looking at the person she is with. She is unaware a photo is being taken. Match the time of day exactly — do not show daytime if the scene is at night. ${spicy ? "Explicit and sexual is allowed when it fits the scene and her Lust. Still match what is actually happening." : "Keep it fully clothed and non-sexual."} One or two sentences, under 300 characters, no names of real people, output only the description.`;
  const user = `SCENE: ${scene.title}${scene.details ? ` — ${scene.details}` : ""}\nHER LOOK: ${ch.appearance || "(see reference pictures)"}\n\nTHE SCENE SO FAR:\n${transcript || "(it just started)"}`;
  let text = "";
  if (p) {
    try {
      const r = await oaChat(p, [{ role: "system", content: system }, { role: "user", content: user }], [], 300);
      text = String(r.content || "").replace(/\s+/g, " ").trim();
    } catch { /* fall through */ }
  }
  return text.slice(0, 380) || `${ch.name} during ${scene.title}, candid, natural light`;
}

export async function peekAt(userId: string, ch: Character, scene: Scene, adult: boolean): Promise<{ media: Media; userMsgId: string; mediaMsgId: string }> {
  const lines = (await sql()`select role, content from velo_messages where user_id = ${userId} and character_id = ${ch.id} and scene_id = ${scene.id} and not peek
    order by created_at desc limit 16`).reverse().map(r => ({ role: String(r.role), content: String(r.content) }));
  const spicy = adult && !!ch.romantic && allowsExplicit(ch.traits);
  const description = await describeMoment(ch, scene, lines, spicy);
  const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description },
    { characterId: ch.id, who: ch.name, appearance: ch.appearance, refs: await referenceUrls(ch), romantic: spicy, mood: mediaMood(ch.traits), offer: false, other: null, peek: true, silent: true });
  const [mine] = await sql()`insert into velo_messages (user_id, role, content, character_id, scene_id, peek) values (${userId}, 'user', '*peek*', ${ch.id}, ${scene.id}, true) returning id`;
  const [pic] = await sql()`insert into velo_messages (user_id, role, content, media_id, character_id, scene_id, peek, created_at)
    values (${userId}, 'assistant', '(peek)', ${media.id}, ${ch.id}, ${scene.id}, true, now() + interval '5 milliseconds') returning id`;
  return { media, userMsgId: String(mine.id), mediaMsgId: String(pic.id) };
}
