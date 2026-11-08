// 👭 Characters who know each other firsthand — friends or family. Links go ONE way: set in a
// character's editor, or by writing "@Name" in her backstory, she knows that character. The other one
// only knows her once linked from her side too (when they mention her there, the app offers to). Each knows the other's character sheet (job, hobbies, look,
// personality) and can talk about her. What stays private: how close each one is with the person.
// They only know the person and their friend are friends — unless the person tells them more
// themselves (then it's in that character's own chat and memory). Family ties are known.
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import type { Character } from "./characters";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const first = (s: string, n = 200) => (String(s || "").split(/(?<=[.!?])\s/)[0] || "").slice(0, n);
export const FAMILY = /\b(sister|brother|sibling|twin|mom|mum|mother|dad|father|parent|daughter|son|cousin|aunt|auntie|uncle|niece|nephew|grand\w*|step\w*|half[- ]?(sister|brother)|\w+-in-law|family|related)\b/i;

/** "@Mia" → "Mia" for what the character reads (and the mentions it makes). */
export function atMentions(backstory: string, others: { id: string; name: string }[]): { id: string; sentence: string }[] {
  const out: { id: string; sentence: string }[] = [];
  if (!backstory.includes("@")) return out;
  const sentences = backstory.split(/(?<=[.!?\n])\s*/);
  for (const o of [...others].sort((x, y) => y.name.length - x.name.length)) {
    const name = String(o.name).trim();
    if (!name) continue;
    const re = new RegExp(`@${esc(name)}(?=$|[^\\p{L}])`, "iu");
    const s = sentences.find(x => re.test(x));
    if (s) out.push({ id: o.id, sentence: plainAt(s.trim()).slice(0, 300) });
  }
  return out;
}
export const plainAt = (s: string) => s.replace(/@(?=\p{L})/gu, "");

type Friend = { id: string; name: string; personality: string; backstory: string; relation: string; appearance: string; job: string; casual_wear: string; hobbies: string; kind: string; story: string };

/** Everyone this character knows firsthand: her own links from the editor, plus @mentions in her own backstory. */
export async function friendsOf(ch: Pick<Character, "id" | "name" | "backstory">): Promise<Friend[]> {
  const all = (await sql()`select id, name, personality, backstory, relation, appearance, job, casual_wear, hobbies from chat_characters where id <> ${ch.id}`) as Omit<Friend, "kind" | "story">[];
  const links = await sql()`select known_id, kind, story from chat_character_links where knower_id = ${ch.id}`;
  const byId = new Map<string, Friend>();
  for (const l of links) {
    const other = all.find(o => o.id === String(l.known_id));
    if (other) byId.set(other.id, { ...other, kind: String(l.kind), story: String(l.story || "") });
  }
  for (const m of atMentions(ch.backstory || "", all)) {
    const o = all.find(x => x.id === m.id)!;
    const f = byId.get(o.id);
    byId.set(o.id, f ? { ...f, story: f.story || m.sentence } : { ...o, kind: "", story: `From your own story: ${m.sentence}` });
  }
  return [...byId.values()].slice(0, 8);
}

/** 💬 They mentioned someone to this character who knows HER, but she doesn't know them back:
 *  the chance to link them in this direction too. */
export async function linkSuggestions(ch: Character, text: string): Promise<{ id: string; name: string; kind: string; story: string }[]> {
  if (!text || text.length < 3) return [];
  const mine = new Set((await friendsOf(ch)).map(f => f.id));
  const others = (await sql()`select id, name, backstory from chat_characters where id <> ${ch.id}`) as { id: string; name: string; backstory: string }[];
  const out: { id: string; name: string; kind: string; story: string }[] = [];
  for (const o of others) {
    const name = String(o.name).trim();
    if (name.length < 2 || mine.has(o.id)) continue;
    if (!new RegExp(`(^|[^\\p{L}])@?${esc(name)}(?=$|[^\\p{L}])`, "iu").test(text)) continue;
    const [l] = await sql()`select kind, story from chat_character_links where knower_id = ${o.id} and known_id = ${ch.id}`;
    const at = l ? null : atMentions(o.backstory || "", [{ id: ch.id, name: ch.name }])[0];
    if (l || at) out.push({ id: o.id, name, kind: l ? String(l.kind) : "friends", story: l ? String(l.story || "") : at!.sentence });
  }
  return out;
}

/** For the character's system prompt: who they know, and what they must not know. */
export async function friendsNote(ch: Character, ownerName: string, known?: Friend[]): Promise<string> {
  const friends = known || await friendsOf(ch);
  if (!friends.length) return "";
  const them = ownerName || "the person you're talking with";
  const lines = friends.map(f => {
    const bits = [`${f.name}${f.kind ? ` — your ${f.kind}` : ""}.`];
    if (f.story) bits.push(f.story.endsWith(".") ? f.story : `${f.story}.`);
    if (f.job) bits.push(`Works: ${first(f.job)}`);
    if (f.hobbies) bits.push(`Into: ${first(f.hobbies)}`);
    if (f.personality) bits.push(`Like: ${first(f.personality)}`);
    if (f.appearance) bits.push(`Looks: ${first(f.appearance)}`);
    // Only a family tie to the person is shared — never a romance or how close they are.
    bits.push(f.relation && FAMILY.test(f.relation) ? `Family to ${them}: ${first(f.relation, 160)}` : `${them} and ${f.name} are friends.`);
    return `- ${plainAt(bits.join(" "))}`;
  });
  return `YOUR FRIENDS AND FAMILY (you know them yourself, firsthand — you hang out, text, have history and inside jokes):
${lines.join("\n")}
Talk about them naturally when it fits: their news, plans you made together, stories, opinions, a little teasing. Make up small everyday details that fit who they are, but keep them consistent. You can share a pic of one of them (send_media with of_person) when it fits.
WHAT YOU DON'T KNOW: beyond friendship (and any family tie above), you do NOT know how close ${them} is with any of them — whether they're dating, flirting, how often they talk, or anything they've told each other. Never guess, hint or assume. Only if ${them} tells you about it themselves do you know it (just what they told you). They never tell you what ${them} says to them, and you never tell them what ${them} says to you.`;
}

/** A short "how they know each other", written when a link is made without one (no mention of the person). */
export async function writeStory(a: Character, b: Character, kind: string): Promise<string> {
  try {
    const res = await client.messages.create({
      model: process.env.VELO_MODEL!,
      max_tokens: 160,
      system: "Write one or two short sentences (under 280 characters) about how these two characters know each other and what they like doing together, as their shared history. Use 'they'. Don't mention any user, romance with anyone, or real people. Output only the sentences.",
      messages: [{ role: "user", content: `RELATIONSHIP: ${kind}\nA: ${a.name} — ${first(a.personality)} Job: ${a.job || "?"}. Hobbies: ${a.hobbies || "?"}\nB: ${b.name} — ${first(b.personality)} Job: ${b.job || "?"}. Hobbies: ${b.hobbies || "?"}` }],
    });
    return res.content.map(x => (x.type === "text" ? x.text : "")).join(" ").replace(/\s+/g, " ").trim().slice(0, 600);
  } catch (e) {
    console.error("friends: story", e instanceof Error ? e.message : e);
    return "";
  }
}

/** Who this character knows (her links), and who knows her without her knowing them back. */
export async function listLinks(id: string) {
  const links = (await sql()`select l.known_id as other_id, c.name, l.kind, l.story from chat_character_links l join chat_characters c on c.id = l.known_id
    where l.knower_id = ${id} order by c.name`).map(r => ({ id: String(r.other_id), name: String(r.name), kind: String(r.kind), story: String(r.story) }));
  const knownBy = (await sql()`select l.knower_id as other_id, c.name, l.kind, l.story from chat_character_links l join chat_characters c on c.id = l.knower_id
    where l.known_id = ${id} and not exists (select 1 from chat_character_links x where x.knower_id = ${id} and x.known_id = l.knower_id) order by c.name`).map(r => ({ id: String(r.other_id), name: String(r.name), kind: String(r.kind), story: String(r.story) }));
  return { links, knownBy };
}
/** She (knower) knows the other one (known), from now on. */
export async function setLink(knower: string, known: string, kind: string, story: string) {
  await sql()`insert into chat_character_links (knower_id, known_id, kind, story) values (${knower}, ${known}, ${kind}, ${story})
    on conflict (knower_id, known_id) do update set kind = excluded.kind, story = excluded.story`;
}
export async function removeLink(knower: string, known: string) {
  await sql()`delete from chat_character_links where knower_id = ${knower} and known_id = ${known}`;
}
