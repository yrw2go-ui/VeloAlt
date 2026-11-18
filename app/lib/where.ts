// 🏠 Where the people in their life live. Once they've put their hometown in their profile, most
// new characters and Picagram women live close enough to actually see them — about twenty minutes
// away — and roughly one in seven lives far off, in another state.
import { sql } from "./db";

export type Home = { town: string; state: string };
/** How many of them live far away (the rest are local). */
export const FAR_CHANCE = 0.15;

export async function homeOf(userId: string): Promise<Home | null> {
  const [u] = await sql()`select home_town, home_state from users where id = ${userId}`;
  const town = String(u?.home_town || "").trim();
  const state = String(u?.home_state || "").trim();
  if (!town && !state) return null;
  return { town, state: state === "Outside the US" ? "" : state };
}

export const homeText = (h: Home) => [h.town, h.state].filter(Boolean).join(", ");

/**
 * Where to put someone new. `far` is decided per person (most live close by), and the text goes
 * into whatever is writing them — a character, a Picagram account — so it lands in their story.
 */
export function livesNote(h: Home | null, far = Math.random() < FAR_CHANCE): string {
  if (!h) return "";
  const where = homeText(h);
  return far
    ? `WHERE SHE LIVES: far away from them — a different state entirely (not ${h.state || where}), her own city. They've never met in person; this is a long-distance thing. Name her city and state in her backstory.`
    : `WHERE SHE LIVES: close to them, about twenty minutes from ${where} — her own neighbourhood, suburb or nearby town in the same area, somewhere they could meet up any evening. Name it in her backstory, and let local places (her gym, her coffee shop, the lake, the mall) be ones nearby.`;
}

/** The same, for a character's own instructions once she exists. */
export const liveNear = (h: Home | null) => (h ? `They live in ${homeText(h)}.` : "");
