// 👋 Introductions: now and then a character you're getting close to wants you to meet someone of
// hers — her sister, cousin, best friend, roommate or coworker (her girlfriend, if she's "kinda lesbian
// leaning"). The new person is always a woman, written by the app with a headshot from Atlas made
// FIRST; only then does the card pop up (name, age, photo). Accept → she's yours (private to you), on
// your list, and she and her introducer know each other. Up to 5 accepted introductions; then it stops.
import { after } from "next/server";
import { sql } from "./db";
import { checkPortrait, getCharacter, startPortrait, type Character } from "./characters";
import { closeness, type Closeness } from "./momentPics";
import { makeCharacter } from "./makeCharacter";
import { scrub } from "./secrets";

export const MAX_INTROS = 5;
const RANGE: Record<Closeness, [number, number] | null> = { new: null, warm: [70, 120], close: [45, 90] };
const pick = ([a, b]: [number, number]) => a + Math.floor(Math.random() * (b - a + 1));
const FAMILY = ["sister", "cousin"];

async function acceptedCount(userId: string) {
  const [r] = await sql()`select count(*)::int as n from chat_intros where user_id = ${userId} and status = 'accepted'`;
  return Number(r?.n || 0);
}

/** One more chat exchange with her. If it's time (and there's room), an introduction starts and its kind is returned. */
export async function tickIntro(userId: string, ch: Character, adult: boolean): Promise<string | null> {
  const level = await closeness(userId, ch);
  const range = RANGE[level];
  if (!range || (await acceptedCount(userId)) >= MAX_INTROS) return null;
  const [open] = await sql()`select 1 from chat_intros where user_id = ${userId} and status in ('making', 'portrait', 'ready') limit 1`;
  if (open) return null;
  const [r] = await sql()`insert into chat_relationships (user_id, character_id, intro_count, intro_at) values (${userId}, ${ch.id}, 1, ${pick(range)})
    on conflict (user_id, character_id) do update set intro_count = chat_relationships.intro_count + 1, intro_at = coalesce(chat_relationships.intro_at, ${pick(range)})
    returning intro_count, intro_at`;
  if (Number(r.intro_count) < Number(r.intro_at)) return null;
  await sql()`update chat_relationships set intro_count = 0, intro_at = ${pick(range)} where user_id = ${userId} and character_id = ${ch.id}`;
  const kinds = ["sister", "cousin", "best friend", "roommate", "coworker", ...(adult && ch.romantic && ch.sapphic ? ["girlfriend"] : [])];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const [intro] = await sql()`insert into chat_intros (user_id, introducer_id, kind) values (${userId}, ${ch.id}, ${kind}) returning id`;
  // Written and pictured after her reply goes out; the card shows once the headshot is ready.
  after(() => makeIntro(userId, String(intro.id), ch, kind).catch(e => console.error("intros:", e instanceof Error ? e.message : e)));
  return kind;
}

/** For her reply: she brings it up. */
export const introNote = (kind: string) => `👋 INTRODUCTION: you'd love for them to meet your ${kind} — bring it up naturally in this reply ("you HAVE to meet my ${kind}…"), say a little about her and that you'll send her pic. Don't give her name yet; it comes with the photo.`;

/** Writes the new character (private, hidden until accepted) and starts her headshot. */
export async function makeIntro(userId: string, introId: string, ch: Character, kind: string) {
  try {
    const names = (await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => String(r.name));
    const fam = FAMILY.includes(kind);
    const d = await makeCharacter({
      vibe: `${ch.name}'s ${kind}. ${fam ? `A family resemblance to ${ch.name} (${ch.appearance || "similar coloring"}) and the same hometown, but her own personality.` : `Knows ${ch.name} well, but has her own personality.`}`,
      romantic: !!ch.romantic, male: false, avoidNames: names,
    });
    const relation = `${ch.name}'s ${kind} — ${ch.name} introduced you`;
    const [c] = await sql()`insert into chat_characters (created_by, owner_id, intro_status, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, birthday, time_zone, work_attire, work_days, work_start, work_end, part_time)
      values (${userId}, ${userId}, 'pending', ${d.name}, ${d.personality}, ${d.backstory}, ${scrub(relation)}, ${d.appearance}, ${d.job}, ${d.casual_wear}, ${d.hobbies}, ${d.voice}, ${d.voice_name}, ${d.voice_kind}, ${d.romantic}, ${d.romance_arc}, ${JSON.stringify(d.traits)}::jsonb, ${d.birthday}, ${ch.time_zone || ""},
        ${d.work_attire}, ${d.work_days}::int[], ${d.work_start}, ${d.work_end}, ${d.part_time}) returning id`;
    const job = await startPortrait(d.name, d.appearance);
    await sql()`update chat_characters set portrait_job = ${job} where id = ${c.id}`;
    await sql()`update chat_intros set character_id = ${c.id}, age = ${d.age}, status = 'portrait' where id = ${introId}`;
  } catch (e) {
    await sql()`update chat_intros set status = 'failed' where id = ${introId}`;
    throw e;
  }
}

export type IntroCard = { id: string; name: string; age: number | null; kind: string; introducer: string; about: string; portrait_url: string | null };

/** Introductions from this character whose headshot is ready (checks the ones still being pictured). */
export async function readyIntros(userId: string, introducerId: string): Promise<IntroCard[]> {
  const rows = await sql()`select i.id, i.character_id, i.kind, i.age, i.status from chat_intros i where i.user_id = ${userId} and i.introducer_id = ${introducerId} and i.status in ('portrait', 'ready') order by i.created_at`;
  const out: IntroCard[] = [];
  const intro = await getCharacter(introducerId);
  for (const r of rows) {
    const c = r.character_id ? await getCharacter(String(r.character_id)) : null;
    if (!c) continue;
    if (r.status === "portrait") {
      const st = await checkPortrait(userId, c).catch(() => "working" as const);
      if (st === "failed") { await sql()`update chat_intros set status = 'failed' where id = ${r.id}`; await sql()`delete from chat_characters where id = ${c.id} and intro_status = 'pending'`; continue; }
      if (st !== "done") continue;
      await sql()`update chat_intros set status = 'ready' where id = ${r.id}`;
    }
    const fresh = await getCharacter(c.id);
    if (!fresh?.portrait_url) continue;
    out.push({ id: String(r.id), name: fresh.name, age: r.age ?? null, kind: String(r.kind), introducer: intro?.name || "", about: (fresh.personality.split(/(?<=[.!?])\s/)[0] || "").slice(0, 200), portrait_url: fresh.portrait_url });
  }
  return out;
}

/** Meet her: she's on their list (private to them), and she and her introducer know each other. */
export async function acceptIntro(userId: string, introId: string): Promise<Character> {
  const [i] = await sql()`select id, introducer_id, character_id, kind from chat_intros where id = ${introId} and user_id = ${userId} and status = 'ready'`;
  if (!i?.character_id) throw new IntroError("That introduction isn't open anymore.");
  if ((await acceptedCount(userId)) >= MAX_INTROS) throw new IntroError(`You've already met ${MAX_INTROS} new people this way.`);
  await sql()`update chat_characters set intro_status = 'accepted', updated_at = now() where id = ${i.character_id} and owner_id = ${userId}`;
  const [a, b] = String(i.introducer_id) < String(i.character_id) ? [i.introducer_id, i.character_id] : [i.character_id, i.introducer_id];
  const intro = await getCharacter(String(i.introducer_id)), c = await getCharacter(String(i.character_id));
  const story = `${c?.name} is ${intro?.name}'s ${i.kind}.`;
  await sql()`insert into chat_bonds (user_id, a_id, b_id, story, kind, messages, occasions) values (${userId}, ${a}, ${b}, ${story}, ${String(i.kind)}, 200, 10)
    on conflict (user_id, a_id, b_id) do update set kind = excluded.kind, story = excluded.story`;
  await sql()`update chat_intros set status = 'accepted' where id = ${introId}`;
  return c!;
}

/** Not now: she's gone (never shown anywhere). */
export async function declineIntro(userId: string, introId: string): Promise<void> {
  const [i] = await sql()`update chat_intros set status = 'declined' where id = ${introId} and user_id = ${userId} and status in ('portrait', 'ready') returning character_id`;
  if (i?.character_id) await sql()`delete from chat_characters where id = ${i.character_id} and owner_id = ${userId} and intro_status = 'pending'`;
}
export class IntroError extends Error {}
