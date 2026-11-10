// 📸 In-the-moment photos: now and then a character offers a picture of what she's up to — about once
// every 50–80 chat exchanges at first, more often as you get closer (35–55, then 20–35). She also
// sometimes sends one with a check-in (push notification), more often as you get closer.
import { sql } from "./db";
import { trustOn } from "./traits";
import type { Character } from "./characters";

export type Closeness = "new" | "warm" | "close";
const RANGE: Record<Closeness, [number, number]> = { new: [50, 80], warm: [35, 55], close: [20, 35] };
export const CHECKIN_PIC_CHANCE: Record<Closeness, number> = { new: 0.1, warm: 0.25, close: 0.4 };
const pick = ([a, b]: [number, number]) => a + Math.floor(Math.random() * (b - a + 1));

/** How close they are: her trust in them (when trust is on), else how much they've talked. */
export async function closeness(userId: string, ch: Pick<Character, "id" | "traits">): Promise<Closeness> {
  const [r] = await sql()`select r.trust, r.feelings, (select count(*)::int from velo_messages m where m.user_id = ${userId} and m.character_id = ${ch.id} and m.role = 'user') as said
    from (select 1) x left join chat_relationships r on r.user_id = ${userId} and r.character_id = ${ch.id}`;
  const said = Number(r?.said || 0), trust = trustOn(ch.traits) && r?.trust != null ? Number(r.trust) : null;
  if ((trust !== null && trust >= 70) || said >= 800) return "close";
  if ((trust !== null && trust >= 40) || said >= 200) return "warm";
  return "new";
}

/** One more exchange with her. True when it's time for her to offer a photo of the moment. */
export async function tickPics(userId: string, ch: Pick<Character, "id" | "traits">): Promise<boolean> {
  const level = await closeness(userId, ch);
  const [r] = await sql()`insert into chat_relationships (user_id, character_id, pic_count, pic_at) values (${userId}, ${ch.id}, 1, ${pick(RANGE[level])})
    on conflict (user_id, character_id) do update set pic_count = chat_relationships.pic_count + 1, pic_at = coalesce(chat_relationships.pic_at, ${pick(RANGE[level])})
    returning pic_count, pic_at`;
  const n = Number(r.pic_count), at = Number(r.pic_at);
  // She let the moment pass a few times: start counting again rather than keep nudging.
  if (n > at + 6) { await resetPics(userId, ch); return false; }
  return n >= at;
}

/** She sent or offered one: count from zero again, toward a new gap that fits how close they are now. */
export async function resetPics(userId: string, ch: Pick<Character, "id" | "traits">): Promise<void> {
  const level = await closeness(userId, ch);
  await sql()`insert into chat_relationships (user_id, character_id, pic_count, pic_at) values (${userId}, ${ch.id}, 0, ${pick(RANGE[level])})
    on conflict (user_id, character_id) do update set pic_count = 0, pic_at = ${pick(RANGE[level])}`;
}

export const PHOTO_MOMENT = `📸 PHOTO MOMENT: now is a natural time to OFFER them a picture of what you're up to right now — where you are, what you're doing or wearing, your view — fitting the time of day and what you've been talking about. It's your own idea, so call send_media with they_asked: false (they'll get an Accept / No thanks button) and casually ask if they'd like to see; don't say it's sent. If it really doesn't fit this message (they're upset, it's serious), skip it and wait for a better moment.`;
