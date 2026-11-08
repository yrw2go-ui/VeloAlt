// 👭 Characters who know each other firsthand — friends or family. Set in the character editor, or
// by writing "@Name" in a backstory. Each knows the other's character sheet (job, hobbies, look,
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

/** Everyone this character knows firsthand: links from the editor, plus @mentions either way. */
export async function friendsOf(ch: Pick<Character, "id" | "name" | "backstory">): Promise<Friend[]> {
  const all = (await sql()`select id, name, personality, backstory, relation, appearance, job, casual_wear, hobbies from chat_characters where id <> ${ch.id}`) as Omit<Friend, "kind" | "story">[];
  const links = await sql()`select a_id, b_id, kind, story from chat_character_links where a_id = ${ch.id} or b_id = ${ch.id}`;
  const byId = new Map<string, Friend>();
  for (const l of links) {
    const other = all.find(o => o.id === (String(l.a_id) === ch.id ? String(l.b_id) : String(l.a_id)));
    if (other) byId.set(other.id, { ...other, kind: String(l.kind), story: String(l.story || "") });
  }
  // "@Mia" in my backstory → I know Mia; "@Anya" in Mia's backstory → Mia knows me too.
  for (const m of atMentions(ch.backstory || "", all)) {
    const o = all.find(x => x.id === m.id)!;
    const f = byId.get(o.id);
    byId.set(o.id, f ? { ...f, story: f.story || m.sentence } : { ...o, kind: "", story: `From your own story: ${m.sentence}` });
  }
  for (const o of all) {
    if (byId.has(o.id) && byId.get(o.id)!.story) continue;
    const mine = atMentions(o.backstory || "", [{ id: ch.id, name: ch.name }])[0];
    if (!mine) continue;
    const f = byId.get(o.id);
    byId.set(o.id, f ? { ...f, story: `From ${o.name}'s story: ${mine.sentence}` } : { ...o, kind: "", story: `From ${o.name}'s story: ${mine.sentence}` });
  }
  return [...byId.values()].slice(0, 8);
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

export async function listLinks(id: string) {
  return (await sql()`select case when l.a_id = ${id} then l.b_id else l.a_id end as other_id, c.name, l.kind, l.story
    from chat_character_links l join chat_characters c on c.id = case when l.a_id = ${id} then l.b_id else l.a_id end
    where l.a_id = ${id} or l.b_id = ${id} order by c.name`).map(r => ({ id: String(r.other_id), name: String(r.name), kind: String(r.kind), story: String(r.story) }));
}
export async function setLink(x: string, y: string, kind: string, story: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await sql()`insert into chat_character_links (a_id, b_id, kind, story) values (${a}, ${b}, ${kind}, ${story})
    on conflict (a_id, b_id) do update set kind = excluded.kind, story = excluded.story`;
}
export async function removeLink(x: string, y: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  await sql()`delete from chat_character_links where a_id = ${a} and b_id = ${b}`;
}
