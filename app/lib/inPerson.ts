// 🧍 Together in person: not a planned scene — you're just with her right now (her place, the car, a store…).
// While it's on she talks face to face instead of texting, and 👁️ ICU (a picture of what you see) works.
import { sql } from "./db";

export type InPerson = { place: string; started_at: string; at_mine: boolean };

export async function inPersonFor(userId: string, characterId: string): Promise<InPerson | null> {
  const [r] = await sql()`select place, started_at::text, at_mine from chat_in_person where user_id = ${userId} and character_id = ${characterId} and ended_at is null`;
  return r ? { place: String(r.place || ""), started_at: String(r.started_at), at_mine: r.at_mine !== false } : null;
}

export async function startInPerson(userId: string, characterId: string, place: string, atMine = false): Promise<InPerson> {
  // 🕒 Already together? Then you've moved, not started again: the place changes and the clock
  // keeps running. Resetting it would throw away the time you'd already spent together.
  const [r] = await sql()`insert into chat_in_person (user_id, character_id, place, at_mine) values (${userId}, ${characterId}, ${place}, ${atMine})
    on conflict (user_id, character_id) where ended_at is null do update set place = excluded.place, at_mine = excluded.at_mine returning place, started_at::text, at_mine`;
  return { place: String(r.place || ""), started_at: String(r.started_at), at_mine: r.at_mine !== false };
}

export async function endInPerson(userId: string, characterId: string): Promise<boolean> {
  // The visit is kept, with the time it ended: afterwards she can look back on it (and know a
  // night has passed since, if one has).
  const rows = await sql()`update chat_in_person set ended_at = now() where user_id = ${userId} and character_id = ${characterId} and ended_at is null returning 1`;
  return rows.length > 0;
}

export function inPersonNote(p: InPerson, who: string): string {
  return `🧍 YOU'RE TOGETHER IN PERSON RIGHT NOW${p.place ? ` (${p.place})` : ""} — not texting: you're physically with ${who}, face to face. Talk like it: present tense, a quick action or two in *italics* when it fits (*I nudge your arm*), react to what they say and do right there, and notice them (their face, their voice, being close). Don't talk like you're apart — no "wish you were here", "can't wait to see you", "text me", and don't send them photos of yourself: they can see you. Let them lead their own actions; don't decide what they do. Follow your normal personality, sliders and the conversation (including explicit content when it fits and is allowed). Lines starting with 🧍 mark when you got together and when you went your separate ways.`;
}

// 🏠 She lives with you. "Home" is the same thing as being together in person, except it's her home
// too — so it's the default state, and a toggle above the chat says whether she's in or out.
export const HOME = "home";

export const homeFor = (userId: string, characterId: string) =>
  inPersonFor(userId, characterId).then(p => (p && p.at_mine ? p : null));

/** 🏠 Is she in? Someone who lives with you is home whenever you're together AT YOURS — whatever
 *  the time together is called. It used to look only for the word "home", so being in person with
 *  her at your own house read as her being out. */
export async function isHome(userId: string, c: { id: string; live_in?: boolean }): Promise<boolean> {
  if (!c.live_in) return false;
  const [r] = await sql()`select 1 from chat_in_person where user_id = ${userId} and character_id = ${c.id} and at_mine and ended_at is null`;
  return !!r;
}

/** The 🏠 Home / 🚪 Out switch. Switching her home never ends a time together that's already
 *  running — if you're already with her, you're simply at yours now. */
export const setHome = async (userId: string, characterId: string, home: boolean) => {
  if (!home) { await endInPerson(userId, characterId); return; }
  const now = await inPersonFor(userId, characterId);
  if (!now) { await startInPerson(userId, characterId, HOME, true); return; }
  // Together already: keep the place and the clock, just say you're at yours.
  if (!now.at_mine) await sql()`update chat_in_person set at_mine = true where user_id = ${userId} and character_id = ${characterId} and ended_at is null`;
};

export function homeNote(who: string): string {
  return `🏠 YOU'RE BOTH HOME RIGHT NOW — you live together, and you're in the house with ${who} this minute. This isn't texting: you're in the same rooms, face to face. Talk like it: present tense, a quick action in *italics* when it fits (*I call through from the kitchen*), answer what they say and do right there, and live in the place — what you're cooking, the telly on, the washing, who's getting the door, coming through to find them. Don't talk like you're apart: no "wish you were here", no "can't wait to see you", no "text me later", and don't send them photos of yourself — they can see you. You know the difference between this and being out: when you're out you text, when you're home you talk. Let them lead their own actions; never decide what they do. Keep it within PG-13 and your sliders. Lines starting with 🏠 mark when you came in or went out.`;
}

/** What her card says about the arrangement, so she lives it rather than announcing it. */
export const LIVE_IN_NOTE = `🏠 YOU LIVE WITH THEM — it's your home too: your things are here, you come and go, you have your own routine in it. How that came about and what it's like is in your description and backstory; live it rather than explaining it.`;
