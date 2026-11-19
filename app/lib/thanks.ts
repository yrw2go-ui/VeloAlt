// 💌 What happens the moment a present lands.
//
// She doesn't wait to be asked about it: she messages straight back, in her own voice, and more
// often than not sends a photo with it — wearing it, holding it, fanning the cash about. How the
// photo looks is hers: her own face, what she'd actually have on, and her sliders.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { startMedia, mediaNote, MediaError } from "./media";
import { mediaMood, allowsSuggestive, cleanTraits } from "./traits";
import { referenceUrls, type Character } from "./characters";
import { giftById, photoBrief, giftFace, wearOdds, say, PHOTO_ODDS } from "./gifts";
import { wordingFor } from "./wording";
import { hurtNote, photoOdds, warmth, moodOf, thanksFallback } from "./hurt";
import { happyFor, saveHappy } from "./characters";


/** 💬 She writes back about it, straight away, and usually sends a picture with it. */
export async function thankThem(userId: string, ch: Character, what: string, kind: "gift" | "money", giftId: string, note: string, adult: boolean, closeness = 50, big = false, wished = false, amount = 0) {
  // 💔 How she is with you right now, and how many presents have landed in the last couple of days.
  // A present from someone who has hurt you doesn't land the way it would on a good day.
  const happy = await happyFor(userId, ch).catch(() => 60);
  const [{ n: recent }] = await sql()`select count(*)::int as n from pica_gift_sent
    where user_id = ${userId} and character_id = ${ch.id} and created_at > now() - interval '48 hours'`;
  const gifts = Number(recent) || 1;
  const sore = hurtNote(happy, gifts, String((await sql()`select name from users where id = ${userId}`)[0]?.name || "they"));
  const g = giftId ? giftById(giftId) : null;
  const [u] = await sql()`select name from users where id = ${userId}`;
  const them = String(u?.name || "they");
  const t = cleanTraits(ch.traits);
  const romantic = adult && !!ch.romantic;
  const text = await writeText(ch.brain,
    `You are ${ch.name}. ${ch.personality || ""}
${them} has just sent you ${what}${g?.team ? " — gear for the team you actually follow or play for, whichever that is from who you are" : ""}${g?.theirs ? " — and it's YOUR usual: the exact drink or the exact food you actually order, name it, not a stock answer and not tacos unless tacos are genuinely your thing" : ""}${note ? ` with a note: "${note}"` : ""}. Write the message you'd send them the second it arrived — on your phone, straight away, nothing else going on.
One or two short lines, your own voice, the way you actually text. Be pleased in the way YOU would be (delighted, winding them up, playing it cool, a bit overwhelmed, teasing them for spoiling you). Say something about the thing itself, not "thank you for the gift". Never mention a price, never call it a transaction, never grovel. Say it the way YOU would and no louder: an over-the-top line belongs only to someone who really is that over the top, and most people are not. Write it in plain words, the way a real person texts — not in performed internet voice. Never reach for \"you're ridiculous\", \"you absolute menace\", \"I'm obsessed\", \"I'm screaming\", \"I'm deceased\", \"I'm destroying it\", \"obsessed with this\" or anything of that shape, whoever you are. And do not read the name of it back like a label — they know what they sent.${romantic && t.flirty >= 4 ? " Flirty is fine." : ""}
${sore ? `\n${sore}` : ""}\nReply with the message only — no quotes, no name, no stage directions.`,
    `WHAT ARRIVED: ${what}`, 200).catch(() => "");
  const words = scrub(String(text || "").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim()).slice(0, 400)
    || thanksFallback(t, happy, kind === "money");
  // 🎁 The chat says what turned up before she says anything about it — the way the other markers
  // do (🎥 video chat ended, 🏠 she's home).
  const line = `🎁 Received: ${what}`;
  const [mark] = await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'user', ${line}, ${ch.id}) returning id, created_at::text as at`;
  const [msg] = await sql()`insert into velo_messages (user_id, role, content, character_id) values (${userId}, 'assistant', ${words}, ${ch.id}) returning id, created_at::text as at`;

  // 📸 And usually a picture of her with it.
  let media = null;
  if (Math.random() < photoOdds(PHOTO_ODDS, happy, gifts)) {
    // 👗 On her, or held up to the camera: how close you are and who she is decide which.
    // 📝 Settings → Photo wording: every line of this is theirs to change.
    const gw = await wordingFor(userId).catch(() => ({}));
    const { brief, wearing, hands } = photoBrief(what, kind, g, wearOdds(t, closeness), Math.random(), gw);
    // 🏟️ Team gear: her own team, so whatever her description says she follows or plays for goes in.
    // 🏟️☕ Team gear and the edible ones are whatever is genuinely hers, so she's described to the
    // picture: her hobbies, her life, where she is.
    const who = g?.team || g?.theirs ? ` ${ch.hobbies || ""} ${ch.lives_in || ""} ${ch.backstory || ""}`.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    // 😊 Her face is hers: her sliders, and how close the two of you are.
    const face = giftFace(t, closeness, big, gw);
    const sameWoman = say(gw, "gift_same_woman");
    // 📸 with_me is what makes her OWN reference photos go to the picture service (the same flag a
    // peek and a Picagram DM use). Without it her references are fetched and then thrown away, the
    // picture is drawn from words alone, and it doesn't look like her.
    media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: `${brief}. ${face}${who ? ` About her: ${who}` : ""} ${ch.casual_wear && !wearing ? `Wearing ${ch.casual_wear}.` : ""} ${sameWoman} ${hands}` },
      { characterId: ch.id, who: ch.name, appearance: ch.appearance, refs: await referenceUrls(ch).catch(() => []),
        romantic: romantic && allowsSuggestive(ch.traits), mood: mediaMood(ch.traits), offer: false })
      .catch(e => { console[e instanceof MediaError ? "warn" : "error"]("thanks: photo", e instanceof Error ? e.message : e); return null; });
    // 📷 The picture rides in on a message of its own, with the same "sending a photo" line every
    // other picture in the chat has — so you see it being made, then it turns up.
    if (media && media.status !== "failed") await sql()`insert into velo_messages (user_id, role, content, character_id, media_id, created_at)
      values (${userId}, 'assistant', ${mediaNote(media.kind, media.status, media.description, null, null)}, ${ch.id}, ${media.id}, now() + interval '1 second')`;
  }
  // 💗 It helps. Not a clean slate, but a step back toward where you were.
  if (moodOf(happy) !== "fine") await saveHappy(userId, ch.id, happy + warmth(happy, gifts, wished, amount), happy).catch(() => {});

  return { marker: { id: String(mark.id), at: String(mark.at), role: "user" as const, content: line },
    id: String(msg.id), at: String(msg.at), content: words, media };
}
