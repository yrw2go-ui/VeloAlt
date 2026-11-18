// 💌 What happens the moment a present lands.
//
// She doesn't wait to be asked about it: she messages straight back, in her own voice, and more
// often than not sends a photo with it — wearing it, holding it, fanning the cash about. How the
// photo looks is hers: her own face, what she'd actually have on, and her sliders.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { startMedia, MediaError } from "./media";
import { mediaMood, allowsSuggestive, cleanTraits } from "./traits";
import { referenceUrls, type Character } from "./characters";
import { giftById, photoBrief, PHOTO_ODDS } from "./gifts";


/** 💬 She writes back about it, straight away, and usually sends a picture with it. */
export async function thankThem(userId: string, ch: Character, what: string, kind: "gift" | "money", giftId: string, note: string, adult: boolean) {
  const g = giftId ? giftById(giftId) : null;
  const [u] = await sql()`select name from users where id = ${userId}`;
  const them = String(u?.name || "they");
  const t = cleanTraits(ch.traits);
  const romantic = adult && !!ch.romantic;
  const text = await writeText(ch.brain,
    `You are ${ch.name}. ${ch.personality || ""}
${them} has just sent you ${what}${note ? ` with a note: "${note}"` : ""}. Write the message you'd send them the second it arrived — on your phone, straight away, nothing else going on.
One or two short lines, your own voice, the way you actually text. Be pleased in the way YOU would be (delighted, winding them up, playing it cool, a bit overwhelmed, teasing them for spoiling you). Say something about the thing itself, not "thank you for the gift". Never mention a price, never call it a transaction, never grovel.${romantic && t.flirty >= 4 ? " Flirty is fine." : ""}
Reply with the message only — no quotes, no name, no stage directions.`,
    `WHAT ARRIVED: ${what}`, 200).catch(() => "");
  const words = scrub(String(text || "").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim()).slice(0, 400)
    || (kind === "money" ? `okay WHAT 😳 ${what}?? you didn't have to do that` : `it came!! ${what} 😍 you're ridiculous`);
  const [msg] = await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'assistant', ${words}, ${ch.id}) returning id, created_at::text as at`;

  // 📸 And usually a picture of her with it.
  let media = null;
  if (Math.random() < PHOTO_ODDS) {
    const brief = photoBrief(what, kind, g);
    media = await startMedia(userId, { kind: "image", description: `${brief}. ${ch.casual_wear ? `Wearing ${ch.casual_wear}.` : ""} Taken on her own phone where she is, candid and real.` },
      { characterId: ch.id, who: ch.name, appearance: ch.appearance, refs: await referenceUrls(ch).catch(() => []),
        romantic: romantic && allowsSuggestive(ch.traits), mood: mediaMood(ch.traits), offer: false })
      .catch(e => { if (!(e instanceof MediaError)) console.error("thanks: photo", e instanceof Error ? e.message : e); return null; });
    if (media) await sql()`insert into velo_messages (user_id, role, content, character_id, media_id) values (${userId}, 'assistant', '', ${ch.id}, ${media.id})`;
  }
  return { id: String(msg.id), at: String(msg.at), content: words, media };
}
