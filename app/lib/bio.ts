// 👤 "About you": what Velo and characters know about the person (all optional, written by them):
// how they describe themselves, their look (from a photo, described once in words), age or
// birthday, and the state they live in. Never used to make pictures of them.
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { scrub } from "./secrets";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Age on a given local date (YYYY-MM-DD) from a birthday (YYYY-MM-DD). */
export function ageOn(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
function daysUntilBirthday(birthday: string, today: string): number {
  const [, bm, bd] = birthday.split("-").map(Number), [ty, tm, td] = today.split("-").map(Number);
  const t = Date.UTC(ty, tm - 1, td);
  let next = Date.UTC(ty, bm - 1, bd);
  if (next < t) next = Date.UTC(ty + 1, bm - 1, bd);
  return Math.round((next - t) / 86_400_000);
}

/** The "about them" part of the instructions (empty if they haven't filled anything in). */
export async function aboutThem(userId: string, today: string): Promise<string> {
  const [u] = await sql()`select bio, bio_photo_note, birthday::text, age, home_state from users where id = ${userId}`;
  if (!u) return "";
  const lines: string[] = [];
  if (u.home_state && u.home_state !== "Outside the US") lines.push(`They live in ${u.home_state}.`);
  if (u.home_state === "Outside the US") lines.push("They live outside the US.");
  if (u.birthday) {
    const b = String(u.birthday), d = daysUntilBirthday(b, today), [, m, day] = b.split("-").map(Number);
    lines.push(`They're ${ageOn(b, today)} (birthday ${MONTHS[m - 1]} ${day}${d === 0 ? " — that's TODAY! Wish them a happy birthday once, early on — not in every message" : d <= 7 ? ` — in ${d} day${d === 1 ? "" : "s"}` : ""}).`);
  } else if (u.age) lines.push(`They're ${u.age}.`);
  if (u.bio_photo_note) lines.push(`What they look like (from the photo they shared): ${u.bio_photo_note}`);
  if (u.bio) lines.push(`How they describe themselves: ${u.bio}`);
  if (!lines.length) return "";
  return `ABOUT THEM (from their own profile — use it naturally, the way someone who knows them would: a compliment about something real like their glasses, freckles or smile, a nod to their age or where they live. Bring a detail up only now and then, when it fits — never in every message, never all at once, and never in a creepy way):\n${lines.map(l => `- ${l}`).join("\n")}`;
}

/** Describes their photo once, in words: visible features only, nothing sensitive. Returns null if there's no person. */
export async function describePhoto(data: Buffer, type: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.VELO_MODEL) return null;
  const media = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type) ? type : "image/jpeg") as "image/jpeg";
  const res = await client.messages.create({
    model: process.env.VELO_MODEL, max_tokens: 1500, output_config: { effort: "low" },
    system: "You describe a person's visible appearance from their own profile photo so a friend can mention real details naturally. One or two short lines: hair (color, length, style), eye color if clearly visible, glasses, facial hair, freckles, dimples, smile, and clothing style. Do NOT guess identity, age, ethnicity, religion, health, body size or weight, and make no judgments. If no person is clearly visible, reply exactly NONE.",
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: media, data: data.toString("base64") } }, { type: "text", text: "Describe their visible appearance." }] }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join(" ").replace(/\s+/g, " ").trim();
  if (!text || /^NONE\b/i.test(text) || res.stop_reason === "refusal") return null;
  return scrub(text).slice(0, 600);
}
