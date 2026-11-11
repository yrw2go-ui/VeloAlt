// 🧍 Together in person: not a planned scene — you're just with her right now (her place, the car, a store…).
// While it's on she talks face to face instead of texting, and 👁️ ICU (a picture of what you see) works.
import { sql } from "./db";

export type InPerson = { place: string; started_at: string };

export async function inPersonFor(userId: string, characterId: string): Promise<InPerson | null> {
  const [r] = await sql()`select place, started_at::text from chat_in_person where user_id = ${userId} and character_id = ${characterId}`;
  return r ? { place: String(r.place || ""), started_at: String(r.started_at) } : null;
}

export async function startInPerson(userId: string, characterId: string, place: string): Promise<InPerson> {
  const [r] = await sql()`insert into chat_in_person (user_id, character_id, place) values (${userId}, ${characterId}, ${place})
    on conflict (user_id, character_id) do update set place = excluded.place, started_at = now() returning place, started_at::text`;
  return { place: String(r.place || ""), started_at: String(r.started_at) };
}

export async function endInPerson(userId: string, characterId: string): Promise<boolean> {
  const rows = await sql()`delete from chat_in_person where user_id = ${userId} and character_id = ${characterId} returning 1`;
  return rows.length > 0;
}

export function inPersonNote(p: InPerson, who: string): string {
  return `🧍 YOU'RE TOGETHER IN PERSON RIGHT NOW${p.place ? ` (${p.place})` : ""} — not texting: you're physically with ${who}, face to face. Talk like it: present tense, a quick action or two in *italics* when it fits (*I nudge your arm*), react to what they say and do right there, and notice them (their face, their voice, being close). Don't talk like you're apart — no "wish you were here", "can't wait to see you", "text me", and don't send them photos of yourself: they can see you. Let them lead their own actions; don't decide what they do. Follow your normal personality, sliders and the conversation (including explicit content when it fits and is allowed). Lines starting with 🧍 mark when you got together and when you went your separate ways.`;
}
