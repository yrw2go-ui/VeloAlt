// 📸 Picagram: a pretend Instagram for each person's world. Every day 3–5 characters post (2–3 photos,
// the rest text), strangers and friends like and comment, and the person can post too. Posts keep
// coming even on days they don't look. Characters know about it: their own posts (and whether the
// person saw, liked or commented), the person's posts, and when they're out of town on vacation.
import { missingSchema, sql } from "./db";
import { writeText } from "./llm";
import { brainFor } from "./whichBrain";
import { commentBrains, brainOrder } from "./pickBrain";
import { availableBrains } from "./models";

/**
 * 🧠 Who does the writing for Picagram's own people: the brain you picked in Settings.
 *
 * It used to be Claude and only Claude here, so the day Claude's key stopped answering nobody
 * new could be invented at all — the button just said it couldn't bring anyone in. It now follows
 * your choice, the same way a chat and a DM already do, and Claude is still behind it.
 */
/** ⏱️ How long one ask may take. Three of these and a caption still fit inside the route's minute. */
// ⏱️ How long a brain gets to write one of these. It covers the whole order, so with a backup
// switched on both goes share it. Eight seconds was too mean for the Atlas brains: they think
// before they answer, and every one of them was being cut off mid-thought and never answering
// at all, which is what "none of [kimi, claude] could write it" in the logs was.
const THINK = { ms: 20_000 };

// 🧠 Inventing someone new is the one thing here that has to come out right first time, and it is
// what the Atlas brains keep failing at — a timeout or an empty answer and nobody arrives, with no
// backup behind it on purpose. So a new face is Claude's unless you pick someone else yourself in
// the retry. Her posts, captions and comments still go to the brain picked in Settings.
const NEW_FACE_BRAIN = ["claude"];

// 🧠 Who writes the posts, captions and comments here: whoever is picked for posts on Picagram,
// and otherwise the brain picked in Settings. They are separate because a chat brain that stops
// answering takes the whole feed down with it — nobody posts, and nothing says why.
const picaBrain = async (userId: string): Promise<string[]> => {
  let picked = "", backup = "";
  try {
    const [u] = await sql()`select chat_model, post_brain, backup_brain from users where id = ${userId}`;
    picked = String(u?.post_brain || u?.chat_model || "");
    backup = String(u?.backup_brain || "");
  } catch (e) {
    // The column isn't on this database yet: carry on with the Settings brain as before.
    if (!missingSchema(e)) throw e;
    const [u] = await sql()`select chat_model, backup_brain from users where id = ${userId}`;
    picked = String(u?.chat_model || "");
    backup = String(u?.backup_brain || "");
  }
  // 🛟 …and the backup you already switched on, behind it. A chat has had this all along; here it
  // did not, so one brain going quiet took the whole feed with it and nothing said why. Nothing is
  // spent twice: the second one is only asked after the first has actually failed.
  return brainOrder(picked, backup);
};
import { scrub } from "./secrets";
import { listCharacters, referenceUrls, type Character } from "./characters";
import { startMedia, deleteMedia, whenMediaReady, wornLately, MediaError, type Media } from "./media";
import { swapIn } from "./redo";
import { allowsSuggestive, mediaMood, cleanTraits, DEFAULT_TRAITS, TRAITS } from "./traits";
import { isValidTimeZone, localDate, zonedParts, zonedToUtc } from "./localTime";
import { randomComments, quickComment } from "./picaComments";
import { vibeNote, rollLesbian, FIRST_NAMES, LAST_NAMES } from "./vibes";
import { usedNames } from "./makeCharacter";
import { localNote } from "./local";
import { makeCharacter } from "./makeCharacter";
import { noteMentions, PLAIN_WORDS } from "./characters";
import { wordingFor } from "./wording";
import { wordsFor } from "./wordsDb";
import { hobbyRule } from "./hobbies";



import { TONES, hash, shotFor, toneFor } from "./shots";
import { plainFacePhoto } from "./facePhoto";
import { FOLKS, type Folk, folkNote, folkMemory, FOLK_SUGGESTIVE } from "./folks";
import { noJargon } from "./text";
import { homeOf, homeText, livesNote, FAR_CHANCE } from "./where";

const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
const romanticFor = (c: Character, adult: boolean) => adult && !!c.romantic && allowsSuggestive(c.traits);
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function userInfo(userId: string) {
  const [u] = await sql()`select name, time_zone, adult_confirmed_at, bio_photo_note from users where id = ${userId}`;
  const tz = isValidTimeZone(u?.time_zone) ? String(u.time_zone) : "America/Chicago";
  return { name: String(u?.name || "").split(/\s+/)[0] || "you", tz, adult: !!u?.adult_confirmed_at, look: String(u?.bio_photo_note || "") };
}

// ✈️ Out of town: until the date (inclusive), no meet-ups in person.
export async function awayFor(userId: string, characterId: string): Promise<{ place: string; until: string } | null> {
  const [r] = await sql()`select place, until::text from chat_away where user_id = ${userId} and character_id = ${characterId} and kind = 'trip' and until >= current_date - 1`;
  if (!r) return null;
  const { tz } = await userInfo(userId);
  return String(r.until) >= localDate(Date.now(), tz) ? { place: String(r.place), until: String(r.until) } : null;
}
// 🏡 A staycation: days off spent at home — she's around, just not working.
export async function stayFor(userId: string, characterId: string): Promise<{ until: string } | null> {
  const [r] = await sql()`select until::text from chat_away where user_id = ${userId} and character_id = ${characterId} and kind = 'stay' and until >= current_date - 1`;
  if (!r) return null;
  const { tz } = await userInfo(userId);
  return String(r.until) >= localDate(Date.now(), tz) ? { until: String(r.until) } : null;
}

export const awayText = (name: string, a: { place: string; until: string }) =>
  `${name} is out of town${a.place ? ` (${a.place})` : ""} until ${new Date(`${a.until}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} — no meeting up in person till then.`;

// 📅 How many posts from other people land in the feed on a day (their own posts are on top of this).
/** 🌙 The last a post goes up: 1am, the small hours of the next morning. */
const lastCall = (day: string, tz: string, fallback: number) => (zonedToUtc(`${day}T23:00`, tz) || fallback) + 2 * 3600_000;

export const DAY_POSTS: [number, number] = [4, 9];

/** Make sure each day (today, and a few missed ones) has its posts. Returns how many days were made. */
export async function ensurePicaDays(userId: string, backfill = 2, scheduled = false): Promise<number> {
  // ⏸️ Not looked at Picagram for 4 days: nobody posts until they look again.
  if (scheduled) {
    const [u] = await sql()`select pica_looked_at > now() - interval '4 days' as active from users where id = ${userId}`;
    if (!u?.active) return 0;
  }
  const { tz } = await userInfo(userId);
  const today = localDate(Date.now(), tz), hour = zonedParts(Date.now(), tz).hour;
  let made = 0;
  // Catch up only on days since they started (never before their first Picagram day).
  const [first] = await sql()`select min(day)::text as d from pica_days where user_id = ${userId}`;
  for (let i = backfill; i >= 0; i--) {
    const day = addDays(today, -i);
    if (i > 0 && (!first?.d || day < String(first.d))) continue;
    if (i === 0 && hour >= 1 && hour < 7) continue; // today's posts start in the morning (the small hours still belong to last night)
    const [fresh] = await sql()`insert into pica_days (user_id, day) values (${userId}, ${day}) on conflict do nothing returning day`;
    if (!fresh) continue;
    try { if (await generateDay(userId, day, i === 0)) made++; }
    catch (e) { console.error("pica: day", e instanceof Error ? e.message : e); await sql()`delete from pica_days where user_id = ${userId} and day = ${day}`; }
  }
  return made;
}

/** They opened Picagram. Returns whether it was still going (looked in the last 4 days) — if not, it resumes from today. */
export async function picaLooked(userId: string): Promise<boolean> {
  const [u] = await sql()`update users x set pica_looked_at = now() from (select pica_looked_at as old from users where id = ${userId}) o where x.id = ${userId}
    returning o.old > now() - interval '4 days' as active`;
  return !!u?.active;
}

type Planned = { author: string; kind: "image" | "text"; caption: string; photo: string; with: string; vacation: { place: string; days: number; home?: boolean } | null; friend_comments: { from: string; text: string }[] };

async function generateDay(userId: string, day: string, isToday: boolean): Promise<boolean> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  const away = new Set((await sql()`select id from chat_characters where pica_hidden`).map(r => String(r.id)));
  const chars = (await listCharacters(userId)).filter(c => (!c.owner_id || c.owner_id === userId) && !away.has(c.id));
  const u = await userInfo(userId);
  // 📅 How much lands in the feed today, from everyone else (their own posts don't count):
  // 4–9, split between their characters and the women they follow (plus the new face of the day).
  const total = rand(DAY_POSTS[0], DAY_POSTS[1]);
  const charN = chars.length ? Math.min(chars.length, Math.max(1, Math.round(total * (0.4 + Math.random() * 0.3)))) : 0;
  // 💃 Other accounts (people they follow, plus someone new to discover) make up the rest.
  await accountPosts(userId, day, isToday, u, total - charN).catch(e => console.error("pica: accounts", e instanceof Error ? e.message : e));
  if (!charN) return true;
  const authors = shuffle(chars).slice(0, charN);
  const links = new Map<string, { knows: string[]; knownBy: string[] }>();
  const info = await Promise.all(authors.map(async (c, i) => {
    // Only characters linked in their character cards: who she knows (could be in her photo), and who knows her (could comment).
    const knows = (await sql()`select known_id from chat_character_links where knower_id = ${c.id}`).map(r => chars.find(x => x.id === String(r.known_id))?.name).filter((n): n is string => !!n).slice(0, 6);
    const knownBy = (await sql()`select knower_id from chat_character_links where known_id = ${c.id}`).map(r => chars.find(x => x.id === String(r.knower_id))?.name).filter((n): n is string => !!n).slice(0, 6);
    links.set(c.id, { knows, knownBy });
    const friends = knows;
    const away = await awayFor(userId, c.id);
    return `- ${c.name}: ${c.job || "no job listed"}; hobbies: ${c.hobbies || "—"}; style: ${c.casual_wear || "—"}${c.work_attire ? `; at work: ${c.work_attire}` : ""}; about: ${(c.backstory || c.personality || "").slice(0, 300)}${friends.length ? `; friends (could be in her photo): ${friends.join(", ")}` : ""}${links.get(c.id)?.knownBy.length ? `; people who know her (could comment): ${links.get(c.id)!.knownBy.join(", ")}` : "; nobody she knows comments"}${c.explicit_ok && romanticFor(c, u.adult) ? "; explicit photos allowed when it fits" : romanticFor(c, u.adult) ? "; flirty and suggestive, no nudity or lingerie" : "; keep family-friendly"}${away ? `; ✈️ CURRENTLY OUT OF TOWN at ${away.place} until ${away.until} — post from there` : ""}
  ${(await wornLately(userId, c.id, true)).replace(/\n/g, " ")}
  THIS POST'S SHOT: ${shotFor(`${c.id}:${day}`, i)}
  THIS POST'S TONE: ${TONES[toneFor(c.id, Number(new Date(`${day}T00:00:00Z`).getUTCDate()), Number(c.traits?.suggestive || 0), romanticFor(c, u.adult))]}`;
  }));
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const w = await wordingFor(userId);
  const raw = await writeText(await picaBrain(userId), `You plan one day of posts on Picagram (a social photo app like Instagram) for these characters. ${weekday}. Write ${authors.length} posts, one per character listed, in their own voice: ${t.post_life}. At least ${Math.min(authors.length, rand(2, 3))} must be photos ("image"); the rest can be text posts (thoughts, jokes, little updates). Time off should be RARE (most days none, never more than one): only then add "vacation" with how many days it lasts (1–7) and either a place she's travelling to, or "home": true for a staycation — a week off spent at home having fun locally (the lake, day trips, the pool, friends, finally sorting the garden) or just resting. For photos, "photo" describes exactly what the picture shows (who, where, outfit, pose, light) in 1–2 sentences — the character is in it unless it's clearly a picture of something else. ${w.no_looks} Each character is given THIS POST'S SHOT (the angle and how it was taken) and THIS POST'S TONE (how dressed-up it is): follow both, word for word in the photo, so two posts from the same woman never look like the same picture again. ${t.post_vary} "with" names ONE friend from their list who's in the photo, or "". ${t.post_caption} ${PLAIN_WORDS} Now and then (not every post) add ONE "friend_comments" entry from someone in "people who know her"; never anyone else — if that list is empty, leave it empty. A character marked to send explicit photos can include nudity when it fits. Other romantic adults can be flirty and suggestive, with swimwear at the beach or pool, but no nudity or lingerie. Family-friendly characters stay fully clothed. Reply with JSON only: {"posts":[{"author":"Name","kind":"image"|"text","caption":"...","photo":"...","with":"","vacation":null|{"place":"...","days":3}|{"home":true,"days":5},"friend_comments":[{"from":"Name","text":"..."}]}]}`,
    `CHARACTERS:\n${info.join("\n")}`, 2500).catch(() => "");
  let plan: Planned[] = [];
  try { plan = (JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).posts || []) as Planned[]; } catch { /* fall back below */ }
  const byName = new Map(chars.map(c => [c.name.toLowerCase(), c]));
  let posts = authors.map(c => {
    const p = plan.find(x => String(x.author || "").toLowerCase() === c.name.toLowerCase());
    return { c, p: p ? p : { author: c.name, kind: "text" as const, caption: "", photo: "", with: "", vacation: null, friend_comments: [] } };
  }).filter(x => x.p.caption || x.p.photo);
  if (!posts.length) posts = authors.slice(0, 2).map(c => ({ c, p: { author: c.name, kind: "image" as const, caption: "✨", photo: `${c.name} relaxing at home${c.casual_wear ? ` in ${c.casual_wear}` : ""}, candid everyday photo`, with: "", vacation: null, friend_comments: [] } }));
  // At least 2 photos a day.
  const want = Math.min(posts.length, 2);
  for (const x of posts) if (posts.filter(y => y.p.kind === "image").length < want && x.p.kind !== "image") { x.p.kind = "image"; x.p.photo ||= `${x.c.name}, everyday candid photo: ${x.p.caption}`; }
  // When each post goes up: spread through the day (today: from now until the evening).
  const now = Date.now();
  const start = isToday ? now : zonedToUtc(`${day}T09:00`, u.tz) || now;
  const end = isToday ? Math.max(now + 2 * 3600_000, lastCall(day, u.tz, now)) : lastCall(day, u.tz, now) - 30 * 60_000;
  const times = posts.map(() => start + Math.random() * (end - start)).sort((a, b) => a - b);
  // Opening the app on a new day: the first post is already up.
  if (isToday && times.length) times[0] = now - rand(5, 50) * 60_000;
  let vacationUsed = false;
  // 🪪 A character who came from Picagram still has her account: her new posts belong to it too,
  // so you can open her profile from the feed and see everything she's ever posted in one place.
  const accountOf = new Map((await sql()`select id, character_id from pica_accounts where user_id = ${userId} and character_id is not null`).map(r => [String(r.character_id), String(r.id)]));
  for (let i = 0; i < posts.length; i++) {
    const { c, p } = posts[i];
    const at = new Date(times[i]);
    const caption = noJargon(scrub(String(p.caption || ""))).slice(0, 600), photo = scrub(String(p.photo || "")).slice(0, 600);
    const lk = links.get(c.id) || { knows: [], knownBy: [] };
    const friend = p.with && lk.knows.some(n => n.toLowerCase() === String(p.with).toLowerCase()) ? byName.get(String(p.with).toLowerCase()) : undefined;
    let media: Media | null = null;
    if (p.kind === "image" && photo) {
      media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: photo },
        { characterId: c.id, who: c.name, appearance: c.appearance, refs: await referenceUrls(c), romantic: romanticFor(c, u.adult), mood: mediaMood(c.traits), offer: false, pica: true,
          other: friend && friend.id !== c.id ? { name: friend.name, refs: await referenceUrls(friend), appearance: friend.appearance } : null }).catch(e => { if (!(e instanceof MediaError)) console.error("pica: photo", e instanceof Error ? e.message : e); return null; });
    }
    const big = !!c.big_following;
    const fc = (Array.isArray(p.friend_comments) ? p.friend_comments : []).map(x => ({ c: byName.get(String(x.from || "").toLowerCase()), text: noJargon(scrub(String(x.text || ""))).slice(0, 300) })).filter(x => x.c && x.c.id !== c.id && x.text && lk.knownBy.includes(x.c.name)).slice(0, Math.random() < 0.5 ? 1 : 0);
    const likers = [...new Set([...fc.map(x => x.c!.name), ...lk.knownBy.filter(() => Math.random() < 0.4)])];
    const likerSecs = likers.map(() => rand(60, 6 * 3600));
    const [post] = await sql()`insert into pica_posts (user_id, author_id, account_id, kind, caption, photo, media_id, likes_target, liked_by, liker_secs, place, created_at)
      values (${userId}, ${c.id}, ${accountOf.get(c.id) || null}, ${media ? "image" : "text"}, ${caption || (media ? "" : photo)}, ${media ? photo : ""}, ${media?.id || null}, ${big ? rand(200, 1500) : rand(20, 300)}, ${likers}, ${likerSecs}, ${p.vacation?.place ? scrub(String(p.vacation.place)).slice(0, 80) : ""}, ${at.toISOString()}) returning id`;
    for (const x of fc) await sql()`insert into pica_comments (post_id, user_id, author_id, text, created_at) values (${post.id}, ${userId}, ${x.c!.id}, ${x.text}, ${new Date(times[i] + rand(10, 240) * 60_000).toISOString()})`;
    // Her followers comment: more with a big following (up to 5 comments in all, counting a friend's).
    for (const s of randomComments(`${caption} ${photo}`, media ? "image" : "text", Math.max(0, (big ? rand(3, 5) : rand(1, 3)) - fc.length), c.voice_kind === "male" ? "him" : "her"))
      await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(times[i] + rand(2, 360) * 60_000).toISOString()})`;
    // ✈️🏡 A (rare) stretch of time off: away somewhere, or a staycation at home.
    const vac = p.vacation, home = !!vac?.home || (!!vac && !String(vac.place || "").trim());
    if (vac && (home || String(vac.place).trim()) && !vacationUsed && !(await awayFor(userId, c.id)) && !(await stayFor(userId, c.id))) {
      vacationUsed = true;
      const until = addDays(day, Math.max(1, Math.min(7, Number(vac.days) || 3)));
      await sql()`insert into chat_away (user_id, character_id, place, until, kind) values (${userId}, ${c.id}, ${home ? "" : scrub(String(vac.place)).slice(0, 80)}, ${until}, ${home ? "stay" : "trip"})
        on conflict (user_id, character_id) do update set place = excluded.place, until = excluded.until, kind = excluded.kind`;
    }
  }
  return true;
}

// 📜 The feed, a few at a time (newest first), only what's been posted by now.
// ❤️ Likes trickle in: none for the first several seconds, then a climb that's fast at first and slows over ~10 hours —
// in little uneven steps (each post its own rhythm), not all at once.
const ramp = (target: number, at: string, id = "") => {
  const seed = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7);
  const t = Math.max(0, Date.now() - Date.parse(at) - (8 + (seed % 13)) * 1000);
  if (t <= 0) return 0;
  const steps = Math.floor(t / 3000) + 1; // a new batch every few seconds
  const f = Math.min(1, Math.pow(Math.min(t, steps * 3000) / (10 * 3600_000), 0.35));
  return Math.max(1, Math.round(target * f * (0.85 + (seed % 7) / 40))); // never goes down
};
/** Named likers show up once their moment has come. */
const likersNow = (names: string[], secs: number[], at: string) => { const age = (Date.now() - Date.parse(at)) / 1000; return names.filter((_, i) => (secs[i] ?? 0) <= age); };
export type PicaPost = { id: string; saved: boolean; author: { id: string | null; name: string; portrait: string | null; away: string | null; account?: { id: string; handle: string; followed: boolean } }; kind: "image" | "text"; caption: string; media: Media | null; likes: number; liked: boolean; liked_by: string[]; comments: number; preview: PicaComment[]; created_at: string };
export type PicaComment = { id: string; who: string; me: boolean; known: boolean; text: string; created_at: string };

export async function picaFeed(userId: string, before: string | null, limit = 6, after: string | null = null): Promise<PicaPost[]> {
  const { name } = await userInfo(userId);
  const rows = await sql()`select p.*, p.created_at::text as at, c.name as author_name, pf.url as portrait, m.id as m_id, m.kind as m_kind, m.status as m_status, mf.url as m_url, mt.url as m_thumb,
      a.place as away_place, a.until::text as away_until,
      ac.id as acc_id, ac.handle as acc_handle, ac.name as acc_name, ac.followed as acc_followed, af.url as acc_avatar,
      exists(select 1 from pica_saved s where s.user_id = p.user_id and s.media_id = p.media_id) as saved,
      (select count(*)::int from pica_comments k where k.post_id = p.id and k.created_at <= now()) as n_comments
    from pica_posts p left join chat_characters c on c.id = p.author_id left join velo_files pf on pf.id = c.portrait_file_id
      left join velo_media m on m.id = p.media_id left join velo_files mf on mf.id = m.file_id left join velo_files mt on mt.id = m.thumb_file_id
      left join chat_away a on a.user_id = p.user_id and a.character_id = p.author_id and a.kind = 'trip' and a.until >= current_date
      left join pica_accounts ac on ac.id = p.account_id left join velo_media am on am.id = ac.avatar_media_id left join velo_files af on af.id = am.file_id
    where p.user_id = ${userId} and p.created_at <= now() and (p.author_id is null or not coalesce(c.pica_hidden, false))
      and (${before}::timestamptz is null or p.created_at < ${before}::timestamptz)
      and (${after}::timestamptz is null or p.created_at > ${after}::timestamptz)
    order by p.created_at desc limit ${Math.min(limit, 20)}`;
  // 🪪 A character who has no page yet gets one, so her name opens her profile like anyone else's.
  for (const id of [...new Set(rows.filter(r => r.author_id && !r.acc_id).map(r => String(r.author_id)))]) {
    const acc = await accountFor(userId, id).catch(() => null);
    if (!acc) continue;
    const [a] = await sql()`select a.id, a.handle, a.followed, f.url as avatar from pica_accounts a
      left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id where a.id = ${acc}`;
    for (const r of rows) if (String(r.author_id) === id) { r.acc_id = a?.id; r.acc_handle = a?.handle; r.acc_followed = a?.followed; r.acc_avatar = a?.avatar; }
  }
  const ids = rows.map(r => String(r.id));
  const cm = ids.length ? await commentsFor(userId, ids, name, 3) : new Map<string, PicaComment[]>();
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, caption: String(r.caption || ""), created_at: String(r.at),
    author: r.acc_id && !r.author_id
      ? { id: null, name: String(r.acc_name), portrait: r.acc_avatar ? String(r.acc_avatar) : null, away: null, account: { id: String(r.acc_id), handle: String(r.acc_handle), followed: !!r.acc_followed } }
      : { id: r.author_id ? String(r.author_id) : null, name: r.author_id ? String(r.author_name) : name, portrait: r.portrait ? String(r.portrait) : null, away: r.away_place && r.author_id ? `✈️ ${r.away_place}` : null,
          // She came from Picagram and is a character now: her profile is still hers to open.
          account: r.acc_id && r.author_id ? { id: String(r.acc_id), handle: String(r.acc_handle), followed: !!r.acc_followed } : undefined },
    saved: !!r.saved,
    media: r.m_id ? ({ id: String(r.m_id), kind: r.m_kind, status: r.m_status, url: r.m_status === "done" ? r.m_url : null, thumb: r.m_thumb || null } as Media) : null,
    likes: Math.max(ramp(Number(r.likes_target), String(r.at), String(r.id)), likersNow(r.liked_by || [], r.liker_secs || [], String(r.at)).length) + (r.liked ? 1 : 0), liked: !!r.liked,
    liked_by: likersNow((r.liked_by || []) as string[], (r.liker_secs || []) as number[], String(r.at)),
    comments: Number(r.n_comments), preview: cm.get(String(r.id)) || [],
  }));
}

async function commentsFor(userId: string, postIds: string[], myName: string, perPost?: number): Promise<Map<string, PicaComment[]>> {
  const rows = await sql()`select k.id, k.post_id, k.mine, k.name, k.text, k.created_at::text as at, c.name as cname, k.author_id
    from pica_comments k left join chat_characters c on c.id = k.author_id
    where k.user_id = ${userId} and k.post_id = any(${postIds}::uuid[]) and k.created_at <= now() order by k.created_at`;
  const out = new Map<string, PicaComment[]>();
  for (const r of rows) {
    const list = out.get(String(r.post_id)) || [];
    list.push({ id: String(r.id), who: r.mine ? myName : r.author_id ? String(r.cname) : String(r.name), me: !!r.mine, known: !!r.author_id || !!r.mine, text: String(r.text), created_at: String(r.at) });
    out.set(String(r.post_id), list);
  }
  // The preview: known people and their own first, then the latest strangers.
  // The preview: the latest few — always including yours and the replies to them (newest on top).
  if (perPost) for (const [k, list] of out) {
    const known = list.filter(x => x.known).slice(-perPost);
    const pad = list.filter(x => !x.known).slice(-Math.max(0, perPost - known.length));
    out.set(k, [...known, ...pad].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }
  return out;
}
export async function picaComments(userId: string, postId: string): Promise<PicaComment[]> {
  const { name } = await userInfo(userId);
  // Newest first.
  return ((await commentsFor(userId, [postId], name)).get(postId) || []).reverse();
}

/**
 * ✏️ Fix a comment — yours, hers, or a stranger's. Every comment on your feed is on your own
 * Picagram, so they're all yours to word as you like. Blank text leaves it alone (delete the post
 * if you want it gone).
 */
export async function picaCommentEdit(userId: string, id: string, text: string): Promise<PicaComment | null> {
  const t = scrub(String(text || "").replace(/\s+/g, " ").trim()).slice(0, 600);
  if (!t) return null;
  const [row] = await sql()`update pica_comments set text = ${t} where id = ${id} and user_id = ${userId} returning *`;
  if (!row) return null;
  const { name } = await userInfo(userId);
  const known = !!row.author_id || row.mine;
  return { id: String(row.id), who: row.mine ? name : String(row.name || ""), me: !!row.mine, known, text: String(row.text), created_at: String(row.created_at) };
}

export async function picaLike(userId: string, postId: string, on: boolean): Promise<boolean> {
  const r = await sql()`update pica_posts set liked = ${on} where id = ${postId} and user_id = ${userId} returning id`;
  return r.length > 0;
}

/** 👀 They scrolled past these: the characters know they saw them. */
export async function picaSeen(userId: string, ids: string[]): Promise<void> {
  const want = ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50);
  if (want.length) await sql()`update pica_posts set seen_at = now() where user_id = ${userId} and id = any(${want}::uuid[]) and seen_at is null and created_at <= now()`;
}

/** 💬 Their comment. On a character's post, she answers in the comments (and remembers it). */
export async function picaComment(userId: string, postId: string, text: string): Promise<PicaComment[]> {
  const t = scrub(text).replace(/\s+/g, " ").trim().slice(0, 500);
  if (!t) return [];
  const [p] = await sql()`select p.id, p.author_id, p.caption, p.photo from pica_posts p where p.id = ${postId} and p.user_id = ${userId}`;
  if (!p) return [];
  const u = await userInfo(userId);
  const [mine] = await sql()`insert into pica_comments (post_id, user_id, mine, text) values (${postId}, ${userId}, true, ${t}) returning id, created_at::text as at`;
  const out: PicaComment[] = [{ id: String(mine.id), who: u.name, me: true, known: true, text: t, created_at: String(mine.at) }];
  if (p.author_id) {
    const [c] = await sql()`select id, name, personality, brain from chat_characters where id = ${p.author_id}`;
    if (c) {
      const reply = scrub((await writeText(c.brain, `You are ${c.name} (${String(c.personality || "").slice(0, 400)}). On your Picagram post, ${u.name} (someone you know well) just commented. Reply in the comments in your own voice: one short line, maybe an emoji. ${PLAIN_WORDS} Output only the reply.`,
        `YOUR POST: ${p.caption}${p.photo ? ` (photo: ${p.photo})` : ""}\n${u.name}'S COMMENT: ${t}`, 200).catch(() => "")).replace(/^["']|["']$/g, "").trim()).slice(0, 300);
      if (reply) {
        const [r] = await sql()`insert into pica_comments (post_id, user_id, author_id, text) values (${postId}, ${userId}, ${c.id}, ${reply}) returning id, created_at::text as at`;
        out.push({ id: String(r.id), who: String(c.name), me: false, known: true, text: reply, created_at: String(r.at) });
      }
      await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${c.id}, 'fact', ${`On my Picagram post ("${String(p.caption).slice(0, 120)}"), ${u.name} commented: "${t.slice(0, 200)}"${reply ? ` — I replied "${reply.slice(0, 120)}"` : ""}`.slice(0, 600)})`;
    }
  }
  return out;
}

/** 📝 Their own post: text, and/or a photo of them made from a description (their own pictures as reference, if they want). */
// ↻ Redo lives in redo.ts now, so a character's pictures can be redone the same way. Picagram
// keeps these names, and the swap is registered here because this is where refsOf lives.
export { redoDraft as picaRedoDraft, redoMake as picaRedo, swapIn as picaSwapIn } from "./redo";
whenMediaReady((userId, mediaId) => swapIn(userId, mediaId));

/** 💬 Say what's in a picture you uploaded for her. It's what the comments are about. */
export async function picaPictureAbout(userId: string, mediaId: string, about: string): Promise<boolean> {
  const text = scrub(about).replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return false;
  const rows = await sql()`update velo_media set prompt = ${text} where id = ${mediaId} and user_id = ${userId} and model = 'upload' and character_id is null returning id`;
  return rows.length > 0;
}

/** 👥 Your characters, for "who's in it with me" — the ones with a picture on file come first. */
export async function picaWithMe(userId: string) {
  const rows = await sql()`select c.id, c.name, f.url as portrait, coalesce(array_length(c.reference_ids, 1), 0) as shots
    from chat_characters c left join velo_files f on f.id = c.portrait_file_id
    where c.owner_id is null or c.owner_id = ${userId} order by (f.url is null), c.name`;
  return rows.map(r => ({ id: String(r.id), name: String(r.name), portrait: r.portrait ? String(r.portrait) : null, pictures: Number(r.shots) + (r.portrait ? 1 : 0) }));
}

export async function picaPost(userId: string, caption: string, photo: string, useMyPhotos: boolean, raw = false, withId = ""): Promise<string> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  const u = await userInfo(userId);
  const cap = scrub(caption).trim().slice(0, 2000), desc = scrub(photo).replace(/\s+/g, " ").trim().slice(0, 600);
  if (!cap && !desc) throw new MediaError("Write something or describe a photo.");
  // 👥 One of your characters in the picture with you: her own pictures are the reference for her face.
  const [her] = withId && /^[0-9a-f-]{36}$/i.test(withId)
    ? await sql()`select c.id, c.name, c.appearance, c.portrait_file_id, c.reference_ids from chat_characters c
        where c.id = ${withId} and (c.owner_id is null or c.owner_id = ${userId})`
    : [];
  let other: { name: string; refs: string[]; appearance: string } | null = null;
  if (her) {
    const ids = [...((her.reference_ids || []) as string[])].filter(Boolean);
    const shots = ids.length ? await sql()`select f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = any(${ids}::uuid[]) and m.status = 'done'` : [];
    const [face] = her.portrait_file_id ? await sql()`select url from velo_files where id = ${her.portrait_file_id}` : [];
    const refs = [...(face ? [String(face.url)] : []), ...shots.map(r => String(r.url))].filter(x => /^https?:\/\//.test(x)).slice(0, 2);
    other = { name: String(her.name), refs, appearance: String(her.appearance || "") };
  }
  let media: Media | null = null;
  if (desc) {
    const refs = useMyPhotos ? await myRefs(userId) : [];
    media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: desc },
      { characterId: null, who: u.name, appearance: u.look, refs, romantic: u.adult, offer: false, other, pica: true, ...(raw && refs.length && !other ? { raw: true } : {}) });
  }
  const now = Date.now();
  const [post] = await sql()`insert into pica_posts (user_id, author_id, kind, caption, photo, media_id, likes_target, seen_at) values (${userId}, null, ${media ? "image" : "text"}, ${cap}, ${media ? desc : ""}, ${media?.id || null}, ${rand(10, 300)}, now()) returning id`;
  // Women shoot their shot at the person too, on their own posts.
  for (const s of randomComments(`${cap} ${desc}`, media ? "image" : "text", rand(1, 4), "him"))
    await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(now + rand(3, 240) * 60_000).toISOString()})`;
  // 🏷️ Who's in it and who it's about: the one in the picture with you, and anyone you named in
  // the caption or the photo. They all hear about it, whether or not you talk to them much.
  const all = (await sql()`select id, name, personality from chat_characters where owner_id is null or owner_id = ${userId}`) as { id: string; name: string; personality: string }[];
  const named = (text: string) => all.filter(c => String(c.name).trim().length > 2
    && new RegExp(`(^|[^\\p{L}])${String(c.name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "iu").test(text));
  // 🖼️ In the picture: the one you picked, and anyone the photo itself names ("me and Allie at the
  // lake"). Named in the caption only is talk about her, not a picture of her.
  const inPhoto = named(desc);
  const inIt = [...(her ? all.filter(c => String(c.id) === String(her.id)) : []), ...inPhoto]
    .filter((c, i, a) => a.findIndex(x => String(x.id) === String(c.id)) === i);
  const mentioned = named(`${cap} ${desc}`).filter(c => !inIt.some(x => String(x.id) === String(c.id)));
  // 👥 And the people they talk to most notice it, as before.
  const close = await sql()`select c.id, c.name, c.personality, count(*)::int as n from velo_messages m join chat_characters c on c.id = m.character_id
    where m.user_id = ${userId} and m.created_at > now() - interval '30 days' group by c.id, c.name, c.personality order by n desc limit 4`;
  const seen = new Set<string>();
  // A post with another woman in it, or about one, is the sort everybody notices — so the people
  // you talk to all see that one. An ordinary post is still hit and miss, as before.
  const notable = inIt.length > 0 || mentioned.length > 0;
  const fans = [...inIt, ...mentioned, ...(close as unknown as typeof all).filter(() => notable || Math.random() < 0.75)]
    .filter(f => (seen.has(String(f.id)) ? false : (seen.add(String(f.id)), true)));
  if (fans.length) {
    // 🗣️ Who she'd name to whom: the woman in the photo is named to anyone who's heard of her, and
    // to anyone the caption names outright. To everyone else she's a woman they don't know.
    const heard = new Set((await sql()`select knower_id, known_id from chat_acquaintances where user_id = ${userId}`).map(r => `${r.knower_id}:${r.known_id}`));
    const knows = (knower: string, known: { id: string; name: string }) =>
      knower === String(known.id) || heard.has(`${knower}:${known.id}`) || named(cap).some(c => String(c.id) === String(known.id));
    const others = (knower: string) => [...inIt, ...mentioned].filter(c => String(c.id) !== knower)
      .map(c => (knows(knower, c) ? String(c.name) : "a woman I don't know"));
    const who = (f: { id: string }) => {
      const me = inIt.some(c => String(c.id) === String(f.id));
      const rest = [...new Set(others(String(f.id)))];
      const withThem = rest.length ? ` with ${rest.join(" and ")}` : "";
      return media
        ? me ? `a photo of the two of us${rest.length ? ` and ${rest.join(" and ")}` : ""}` : `a photo of himself${withThem}`
        : rest.length ? `something about ${rest.join(" and ")}` : "";
    };
    const isIn = (id: string) => inIt.some(c => String(c.id) === String(id));
    // 💬 Most of them just leave a short line from the free pool — it costs nothing, and it's
    // what most comments really look like. Anyone in the photo, or the post is about, is worth
    // words of her own, and so is roughly one other; the rest are free.
    const inFrame = (f: { id: string }) => inIt.some(c => String(c.id) === String(f.id)) || mentioned.some(c => String(c.id) === String(f.id));
    const voiced = fans.filter(f => inFrame(f) || Math.random() < 0.3);
    const freebies = new Map(fans.filter(f => !voiced.includes(f)).map(f => [String(f.id), quickComment()]));
    const raw = !voiced.length ? "" : await writeText(commentBrains(availableBrains()), `People who know ${u.name} react to ${u.name}'s new Picagram post. For each person, write a short comment in their own voice (or "" if they'd just like it). ${t.post_comments}
A person marked IN THIS PHOTO is the woman in it: she was there when it was taken, it's her own face and body in the picture, and ${u.name} has just put it up for everyone to see. She comments as herself from inside it — how she feels about being up there, what the two of them were doing, teasing him about the pose, being pleased or shy or smug about it. She NEVER talks about the woman in the photo as if she were someone else ("you two look great together", "who's she?") — that would make no sense, because it's her.
Anyone else sees another woman in it and reacts the way she would — pleased, curious, teasing, or a little stung — never cruel. ${PLAIN_WORDS} JSON only: {"comments":[{"from":"Name","text":"..."}]}`,
      `POST: ${cap}${desc ? ` (photo: ${desc})` : ""}${inIt.length ? `\nTHE WOMAN IN THE PHOTO WITH HIM IS ${inIt.map(c => c.name).join(" and ")} — wherever the photo says "her" or "a woman", that is ${inIt.map(c => c.name).join(" / ")}.` : ""}\nPEOPLE:\n${voiced.map(f => `- ${f.name}${isIn(String(f.id)) ? " (IN THIS PHOTO — this is her, with him; she was there)" : ""}${mentioned.some(c => String(c.id) === String(f.id)) ? " (the post is about her)" : ""}: ${String(f.personality || "").slice(0, 200)}`).join("\n")}`, 1000).catch(() => "");
    let cs: { from: string; text: string }[] = [];
    try { cs = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).comments || []; } catch { /* likes only */ }
    await sql()`update pica_posts set liked_by = ${fans.map(f => String(f.name))}, liker_secs = ${fans.map(() => rand(10, 900))} where id = ${post.id}`;
    for (const f of fans) {
      // Her own words if a brain wrote her one; otherwise a free line, so nobody comes up silent.
      const text = (noJargon(scrub(String(cs.find(x => String(x.from).toLowerCase() === String(f.name).toLowerCase())?.text || ""))).slice(0, 300)
        || freebies.get(String(f.id)) || (inFrame(f) ? quickComment() : "")).slice(0, 300);
      if (text) await sql()`insert into pica_comments (post_id, user_id, author_id, text, created_at) values (${post.id}, ${userId}, ${f.id}, ${text}, ${new Date(now + rand(2, 90) * 60_000).toISOString()})`;
      const what = who(f);
      await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${f.id}, 'fact',
        ${`${u.name} posted on Picagram${what ? ` — ${what}` : ""}: "${cap.slice(0, 160)}"${desc ? ` (a photo: ${desc.slice(0, 160)})` : ""}. I liked it${text ? ` and commented "${text.slice(0, 120)}"` : ""}.`.slice(0, 600)})`;
    }
    // 🧠 Seeing her in his post counts as hearing of her, so she's someone they know of from now on.
    for (const f of fans) for (const c of [...inIt, ...mentioned]) if (String(c.id) !== String(f.id)) await noteMentions(userId, String(f.id), String(c.name)).catch(() => {});
  }
  return String(post.id);
}

/** 🧠 What she knows from Picagram lately (for her prompt). */
export async function picaNote(userId: string, ch: Character, personName: string): Promise<string> {
  const who = personName || "they";
  const mine = await sql()`select p.caption, p.photo, p.kind, p.likes_target, p.created_at::text as at, p.seen_at is not null as seen, p.liked,
      (select string_agg(k.text, ' / ') from pica_comments k where k.post_id = p.id and k.mine) as their_comments
    from pica_posts p where p.user_id = ${userId} and p.author_id = ${ch.id} and p.created_at <= now() and p.created_at > now() - interval '5 days' order by p.created_at desc limit 4`;
  const theirs = await sql()`select p.caption, p.photo, p.created_at::text as at, ${ch.name} = any(p.liked_by) as i_liked,
      (select string_agg(k.text, ' / ') from pica_comments k where k.post_id = p.id and k.author_id = ${ch.id}) as my_comments
    from pica_posts p where p.user_id = ${userId} and p.author_id is null and p.created_at > now() - interval '5 days' order by p.created_at desc limit 3`;
  const away = await awayFor(userId, ch.id);
  const ago = (at: string) => { const h = Math.round((Date.now() - Date.parse(at)) / 3600_000); return h < 1 ? "just now" : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
  const lines = [
    ...mine.map(p => `- ${ago(String(p.at))} you posted ${p.kind === "image" ? `a photo (${String(p.photo).slice(0, 160)})` : "a text post"}: "${String(p.caption).slice(0, 160)}" — ${ramp(Number(p.likes_target), String(p.at))} likes; ${p.seen ? `${who} saw it` : `${who} hasn't seen it yet`}${p.liked ? ", liked it ❤️" : ""}${p.their_comments ? `, commented "${String(p.their_comments).slice(0, 160)}"` : ""}`),
    ...theirs.map(p => `- ${ago(String(p.at))} ${who} posted: "${String(p.caption).slice(0, 160)}"${p.photo ? ` (a photo: ${String(p.photo).slice(0, 120)})` : ""}${p.i_liked ? " — you liked it" : ""}${p.my_comments ? `, you commented "${String(p.my_comments).slice(0, 120)}"` : ""}`),
  ];
  const awayLine = away ? `✈️ YOU'RE OUT OF TOWN right now (${away.place}) until ${away.until}: you can't meet up in person until you're back — texts and calls are fine. Talk about the trip naturally.` : "";
  if (!lines.length && !awayLine) return "";
  return `${lines.length ? `PICAGRAM (the photo app you both use, like Instagram) lately:\n${lines.join("\n")}\nBring it up naturally now and then (e.g. "did you see my post?", or about theirs) — don't list it.` : ""}${awayLine ? `\n${awayLine}` : ""}`.trim();
}

// 💃 Other accounts: good-looking women who aren't characters — follow them, like their posts, save their pictures.
type U = { name: string; tz: string; adult: boolean; look: string };
/** One new account a day (up to 120 in all), to discover. */
// 🙅 No look-alikes: a new woman can't reuse a handle, a first name or a surname that someone they
// already follow (or one of their characters) has — "@chloehart / Chloe Hart" and
// "@ChloeHart91 / Claire Hart" are the same person twice as far as a reader is concerned.
const bare = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
const parts = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
function tooClose(handle: string, name: string, taken: { handle: string; name: string }[]): string {
  const [first, ...rest] = parts(name);
  const last = rest.at(-1) || "";
  for (const t of taken) {
    const [tf, ...tr] = parts(t.name);
    const tl = tr.at(-1) || "";
    if (bare(handle) && bare(handle) === bare(t.handle)) return `@${t.handle}`;
    if (first && tf && first === tf) return `${t.name} (same first name)`;
    // A shared surname is only a problem when the first names are near each other too
    // (Chloe Hart / Claire Hart), not when they're plainly different people (Jo Hart).
    if (last && tl && last === tl && first[0] === tf[0]) return `${t.name} (same surname, and both ${first[0].toUpperCase()}…)`;
  }
  return "";
}

/** 🆕 A name nobody here has, for the rare case nothing usable came back. Tries ordinary
 *  first-name/surname pairs until one is clear of everyone already here. */
export function freshName(taken: { handle: string; name: string }[], tries = 40): string {
  for (let i = 0; i < tries; i++) {
    const n = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
    if (!tooClose("", n, taken)) return n;
  }
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}

/** 🏡 One of the six ordinary people, tied to someone real where her brief says so. */
async function newFolk(userId: string, f: Folk, brain?: unknown): Promise<Record<string, unknown> | null> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  // Who she's connected to: one of your characters, or you.
  const [tied] = f.tie === "character"
    ? await sql()`select id, name from chat_characters where (owner_id is null or owner_id = ${userId}) order by random() limit 1`
    : [];
  if (f.tie === "character" && !tied) return null; // nobody to be the sister of yet
  const taken = (await sql()`select handle, name from pica_accounts where user_id = ${userId}`).map(r => ({ handle: String(r.handle), name: String(r.name) }))
    .concat((await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => ({ handle: "", name: String(r.name) })));
  const home = await homeOf(userId);
  const near = home ? ` ${localNote(homeText(home))} Put that town in "lives" as "Town, ST".` : "";
  const raw = await writeText(brain ?? NEW_FACE_BRAIN, `Invent ONE woman who posts on Picagram (a social photo app like Instagram).
${folkNote(f, tied ? String(tied.name) : "", t.pica_folk)}
${t.pica_unique}${near} ${hobbyRule(Math.random())}
JSON only: {"name":"First Last (a plain modern American name)","handle":"lowercase_handle from her name","bio":"short bio, the way a small ordinary account reads","look":"${t.pica_look} — no glamour","lives":"City, State"}`,
    `ALREADY TAKEN — avoid these entirely:\n${taken.map(t => t.name).slice(-60).join(", ") || "(nobody yet)"}`, 1200, THINK).catch(() => "");
  let a: { name?: string; handle?: string; bio?: string; look?: string; lives?: string } = {};
  try { a = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { return null; }
  const name = scrub(String(a.name || "")).replace(/\s+/g, " ").trim().slice(0, 60);
  let handle = String(a.handle || name).toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 28);
  if (!name || handle.length < 2 || tooClose(handle, name, taken)) return null;
  while (taken.some(t => t.handle === handle)) handle = `${handle}${rand(1, 99)}`.slice(0, 28);
  const [row] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, lives, followers, folk)
    values (${userId}, ${handle}, ${name}, ${scrub(String(a.bio || "")).slice(0, 300)}, ${scrub(String(a.look || "")).slice(0, 600)},
      ${scrub(String(a.lives || (home ? homeText(home) : ""))).slice(0, 120) || null}, ${rand(f.followers[0], f.followers[1])}, ${f.key}) returning *`;
  // 🧠 The one she's tied to knows her, and knows she's on Picagram.
  if (tied) {
    await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${tied.id}, 'fact', ${folkMemory(f, name, handle, String(tied.name)).slice(0, 600)})`;
  }
  if (row) void ensurePersona(userId, String(row.id)).catch(() => {});
  return row || null;
}

/** The button asked for her, so she shows up in Following (the daily new face stays a suggestion). */
async function followNew(row: Record<string, unknown> | null, follow: boolean): Promise<Record<string, unknown> | null> {
  if (!row || !follow) return row;
  await sql()`update pica_accounts set followed = true where id = ${String(row.id)}`;
  row.followed = true;
  return row;
}

async function newAccount(userId: string, follow = false, brain?: unknown): Promise<Record<string, unknown> | null> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  const [{ all }] = await sql()`select count(*)::int as all from pica_accounts where user_id = ${userId} and character_id is null`;
  // 🏡 Now and then the new face is an ordinary person rather than another influencer: a sister,
  // a cousin, the neighbour. Each of the six turns up once.
  const used = new Set((await sql()`select folk from pica_accounts where user_id = ${userId} and folk is not null`).map(r => String(r.folk)));
  const left = FOLKS.filter(f => !used.has(f.key));
  if (left.length && Math.random() < 0.4) {
    const made = await newFolk(userId, left[Math.floor(Math.random() * left.length)], brain).catch(e => { console.error("pica: ordinary person", e instanceof Error ? e.message : e); return null; });
    if (made) return followNew(made, follow);
  }
  // Everyone already in their life: the women they follow and their own characters.
  const accounts = (await sql()`select handle, name from pica_accounts where user_id = ${userId}`).map(r => ({ handle: String(r.handle), name: String(r.name) }));
  const chars = (await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => ({ handle: "", name: String(r.name) }));
  const taken = [...accounts, ...chars];
  const names = taken.map(t => (t.handle ? `${t.handle} (${t.name})` : t.name));
  // 🏠 Most of them live near the person (so they could actually meet); about one in seven is far away.
  const home = await homeOf(userId);
  const far = Math.random() < FAR_CHANCE;
  // ⚢ Uncommon: about one in seventeen. Her bio says so in her own way.
  const intoWomen = rollLesbian();
  const where = !home ? "" : far
    ? ` She lives far from ${homeText(home)} — her own city in another state entirely; say which in "lives".`
    : ` ${localNote(homeText(home))} Put that town in "lives" as "Town, ST".`;
  // Three goes at someone genuinely new, telling her what's already taken each time.
  let clash = "";
  for (let go = 0; go < 3; go++) {
    const raw = await writeText(brain ?? NEW_FACE_BRAIN, `Invent ONE woman who posts on Picagram (a social photo app like Instagram).
${vibeNote()}
${intoWomen ? "⚢ SHE IS A LESBIAN — into women, not men. Let her bio say so the way a real profile would (a flag, \"she/her 🏳️‍🌈\", \"girls only\", a line about her girlfriend or ex-girlfriend) without making it the whole bio, and keep the rest of her exactly as the lane says.\n" : ""}${t.pica_unique}${where} ${hobbyRule(Math.random())}
JSON only: {"name":"First Last (a plain modern American name, as described above)","handle":"lowercase_handle (from her name, like ava.miller or mia_russo — no made-up words)","bio":"short bio with emojis","look":"${t.pica_look}","lives":"City, State","followers":12000}`,
      `${names.length ? `ALREADY TAKEN — avoid these names, surnames and handles entirely:\n${names.slice(-60).join(", ")}` : "(nobody yet)"}${clash ? `\n\nYour last try clashed with ${clash} — pick a completely different name.` : ""}`, 1600, THINK).catch(() => "");
    let a: { name?: string; handle?: string; bio?: string; look?: string; lives?: string; followers?: number } = {};
    try { a = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { continue; }
    const handle = String(a.handle || a.name || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 28);
    const name = scrub(String(a.name || "")).replace(/\s+/g, " ").trim().slice(0, 60);
    if (handle.length < 2 || !name) continue;
    clash = tooClose(handle, name, taken);
    if (clash) { console.warn(`pica: ${name} (@${handle}) is too close to ${clash} — trying again`); continue; }
    const lives = scrub(String(a.lives || (home && !far ? homeText(home) : ""))).replace(/\s+/g, " ").trim().slice(0, 120);
    const [row] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, lives, followers, lesbian) values (${userId}, ${handle}, ${name}, ${scrub(String(a.bio || "")).slice(0, 300)}, ${scrub(String(a.look || "")).slice(0, 600)}, ${lives || null}, ${Math.max(2000, Math.min(900000, Number(a.followers) || rand(5000, 200000)))}, ${intoWomen}) returning *`;
    if (row) void ensurePersona(userId, String(row.id)).catch(() => {});
    return followNew(row || null, follow);
  }
  return null;
}

/** 🖼️ The pictures a new photo of her is built from: the ones you uploaded, else her first photo. */
export async function refsOf(a: Record<string, unknown>): Promise<string[]> {
  const ids = ((a.ref_media_ids || []) as string[]).filter(Boolean);
  if (ids.length) {
    const rows = await sql()`select f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = any(${ids}::uuid[]) and m.status = 'done'`;
    if (rows.length) return rows.map(r => String(r.url));
  }
  if (!a.avatar_media_id) return [];
  const [av] = await sql()`select f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = ${String(a.avatar_media_id)} and m.status = 'done'`;
  return av ? [String(av.url)] : [];
}

async function accountPosts(userId: string, day: string, isToday: boolean, u: U, want: number): Promise<void> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  if (want <= 0) return;
  // Accounts they follow (not ones they've befriended — those are characters now), plus today's one new face.
  const fresh = await newAccount(userId);
  const pool = shuffle(await sql()`select * from pica_accounts where user_id = ${userId} and followed and character_id is null`);
  const who: Record<string, unknown>[] = fresh ? [fresh] : [];
  // Spread the day over different women; with only a few followed, some of them post more than once.
  for (let i = 0; pool.length && who.length < want; i++) who.push(pool[i % pool.length]);
  if (!who.length) return;
  const when = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const w = await wordingFor(userId);
  const raw = await writeText(await picaBrain(userId), `Today is ${when}: fit the day of the week, the season and any holiday (weekend brunch, a weekday at work, summer at the beach, winter cozy…). Write one Picagram post for each numbered line below (the same woman can appear twice — then make her two posts clearly different: a different time of day, place and outfit): a photo of her in her everyday life or her niche — gym, beach, pool, brunch, travel, a night out, at home, an outfit — with a caption — ${t.post_caption}. ${u.adult ? "Flattering, flirty and confident is fine: swimwear at the beach or pool is okay; no nudity or lingerie." : "Keep it family-friendly, fully clothed."} "photo" describes exactly what the picture shows (where, outfit, pose, light) in 1–2 sentences. ${w.no_looks} Each woman is given a SHOT (the angle and how it was taken) and a TONE (how dressed-up it is): follow both exactly, so no two of her photos look like the same picture — and change the place, the outfit and the expression from her last one as well. ${PLAIN_WORDS} JSON only: {"posts":[{"n":1,"caption":"...","photo":"..."}]}`,
    who.map((a, i) => `${i + 1}. @${a.handle} (${a.name}): ${a.bio} — looks: ${a.look}${a.personality ? `\n   WHO SHE IS: ${String(a.personality).slice(0, 400)}` : ""}
   SHOT: ${shotFor(`${a.id}:${day}`, i)}
   TONE: ${TONES[toneFor(String(a.id), i, a.folk ? FOLK_SUGGESTIVE : hash(`${a.id}:how`) % 9, u.adult)]}`).join("\n"), 2500).catch(() => "");
  let plan: { n?: number; handle?: string; caption?: string; photo?: string }[] = [];
  try { plan = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).posts || []; } catch { /* skip today */ }
  const now = Date.now();
  const start = isToday ? now : zonedToUtc(`${day}T09:00`, u.tz) || now, end = isToday ? Math.max(now + 2 * 3600_000, lastCall(day, u.tz, now)) : lastCall(day, u.tz, now) - 30 * 60_000;
  for (const [i, a] of who.entries()) {
    const p = plan.find(x => Number(x.n) === i + 1) || plan.find(x => String(x.handle || "").replace(/^@/, "").toLowerCase() === String(a.handle)) || null;
    const photo = scrub(String(p?.photo || `${a.name} candid lifestyle photo, natural light`)).slice(0, 600), caption = noJargon(scrub(String(p?.caption || "✨"))).slice(0, 600);
    const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: photo },
      { characterId: null, who: String(a.name), appearance: String(a.look), refs: await refsOf(a), romantic: u.adult, offer: false, other: null, pica: true }).catch(() => null);
    if (!media) continue;
    if (!a.avatar_media_id) await sql()`update pica_accounts set avatar_media_id = ${media.id} where id = ${String(a.id)}`;
    const at = isToday && i === 0 ? now - rand(5, 40) * 60_000 : start + Math.random() * (end - start);
    const likes = Math.max(150, Math.min(25000, Math.round(Number(a.followers) * (0.005 + Math.random() * 0.03))));
    const [post] = await sql()`insert into pica_posts (user_id, account_id, kind, caption, photo, media_id, likes_target, created_at) values (${userId}, ${String(a.id)}, 'image', ${caption}, ${photo}, ${media.id}, ${likes}, ${new Date(at).toISOString()}) returning id`;
    for (const s of randomComments(`${caption} ${photo}`, "image", rand(3, 5)))
      await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(at + rand(2, 300) * 60_000).toISOString()})`;
  }
}

/** 👩 Make an account yourself: your specs, your bio, your two pictures. She goes up with a first post. */
export async function picaCreateAccount(userId: string, spec: { name: string; handle: string; bio: string; look: string; lives: string; followers: number; follow: boolean; headshotMediaId: string; shotMediaId: string }): Promise<{ id: string; posted: boolean }> {
  const [{ all }] = await sql()`select count(*)::int as all from pica_accounts where user_id = ${userId} and character_id is null`;
  const handle = String(spec.handle || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 28);
  const name = scrub(String(spec.name || "")).replace(/\s+/g, " ").trim().slice(0, 60);
  if (handle.length < 2) throw new PicaLimit("Give her a handle (letters, numbers, dots or underscores).");
  if (!name) throw new PicaLimit("Give her a name.");
  const [clash] = await sql()`select 1 from pica_accounts where user_id = ${userId} and lower(handle) = ${handle} limit 1`;
  if (clash) throw new PicaLimit(`@${handle} is taken — pick another handle.`);
  // Her pictures must be hers: ones you just uploaded, not someone else's.
  const refs = [spec.headshotMediaId, spec.shotMediaId].filter(x => /^[0-9a-f-]{36}$/i.test(String(x || "")));
  const owned = refs.length ? await sql()`select id from velo_media where user_id = ${userId} and status = 'done' and id = any(${refs}::uuid[])` : [];
  const mine = refs.filter(r => owned.some(o => String(o.id) === r));
  if (!mine.length) throw new PicaLimit("Add a headshot of her first.");
  const home = await homeOf(userId);
  const lives = scrub(String(spec.lives || (home ? homeText(home) : ""))).replace(/\s+/g, " ").trim().slice(0, 120);
  const [row] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, lives, followers, followed, mine, avatar_media_id, ref_media_ids)
    values (${userId}, ${handle}, ${name}, ${scrub(String(spec.bio || "")).slice(0, 300)}, ${scrub(String(spec.look || "")).slice(0, 600)}, ${lives || null},
      ${Math.max(100, Math.min(900000, Number(spec.followers) || rand(5000, 200000)))}, ${spec.follow === true}, true, ${mine[0]}, ${mine}::uuid[]) returning *`;
  // 🖼️ The pictures you gave her go up as her first posts — they're hers, so they're on her page.
  const u = await userInfo(userId);
  await putUpUploads(userId, row, mine, u).catch(e => console.error("pica: her own pictures", e instanceof Error ? e.message : e));
  // Then one she takes herself, so she's live from the moment you make her.
  const posted = await postFor(userId, row, u, Date.now() - rand(2, 20) * 60_000)
    .catch(e => { console.error("pica: made her post", e instanceof Error ? e.message : e); return false; });
  await ensurePersona(userId, String(row.id)).catch(() => {});
  return { id: String(row.id), posted };
}

/** 🖼️ Put the pictures you uploaded up as posts of hers, with captions in her voice. */
export async function putUpUploads(userId: string, a: Record<string, unknown>, mediaIds: string[], u: U): Promise<number> {
  const rows = await sql()`select m.id, m.prompt, m.created_at from velo_media m where m.user_id = ${userId} and m.status = 'done' and m.id = any(${mediaIds}::uuid[])
    and not exists (select 1 from pica_posts p where p.user_id = ${userId} and p.media_id = m.id)`;
  if (!rows.length) return 0;
  const order = mediaIds.map(id => rows.find(r => String(r.id) === id)).filter((r): r is NonNullable<typeof r> => !!r);
  // One go at captions for all of them, in her voice.
  const raw = await writeText(await picaBrain(userId), `Write a short Picagram caption for each numbered photo below, in the voice of @${a.handle} (${a.name}): ${a.bio}. Natural and brief, emojis and hashtags fine, no quotes around them. ${PLAIN_WORDS} JSON only: {"captions":[{"n":1,"caption":"..."}]}`,
    order.map((r, i) => `${i + 1}. ${String(r.prompt || "a photo of her")}`).join("\n"), 1000).catch(() => "");
  let caps: { n?: number; caption?: string }[] = [];
  try { caps = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).captions || []; } catch { /* "✨" will do */ }
  for (const [i, r] of order.entries()) {
    const photo = String(r.prompt || "");
    const caption = noJargon(scrub(String(caps.find(c => Number(c.n) === i + 1)?.caption || "✨"))).slice(0, 600) || "✨";
    const at = new Date(r.created_at as string).getTime();
    const likes = Math.max(150, Math.min(25000, Math.round(Number(a.followers) * (0.005 + Math.random() * 0.03))));
    const [post] = await sql()`insert into pica_posts (user_id, account_id, kind, caption, photo, media_id, likes_target, created_at)
      values (${userId}, ${String(a.id)}, 'image', ${caption}, ${photo}, ${String(r.id)}, ${likes}, ${new Date(at).toISOString()}) returning id`;
    for (const c of randomComments(`${caption} ${photo}`, "image", rand(3, 5)))
      await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${c.name}, ${c.text}, ${new Date(at + rand(2, 300) * 60_000).toISOString()})`;
  }
  return order.length;
}

/** ✨ New women, posting right now: invent each one, follow her, and put a first photo up straight away. */
export async function newFaces(userId: string, n: number, pickBrain?: unknown): Promise<{ made: number; names: string[]; error?: string }> {
  // 🧠 One brain only: the one picked in Settings (or the one chosen for a retry). No backup
  // behind it — if it can't manage, the app offers the retry rather than quietly spending twice.
  const brain = pickBrain ? [String(pickBrain)] : NEW_FACE_BRAIN;
  const want = Math.max(1, Math.min(5, n));
  const [{ all, following }] = await sql()`select count(*) filter (where character_id is null)::int as all,
    count(*) filter (where followed and character_id is null)::int as following
    from pica_accounts where user_id = ${userId}`;
  const room = want;
  const u = await userInfo(userId);
  const people: Record<string, unknown>[] = [];
  let error = "";
  // ⏱️ The route has about a minute. Stop asking for another once there isn't time to invent one
  // and give her a photo — better two who really turned up than three the clock cut short.
  const until = Date.now() + 45_000;
  for (let i = 0; i < room; i++) {
    if (Date.now() > until) { console.warn(`pica: out of time after ${people.length} of ${want}`); break; }
    try {
      const a = await newAccount(userId, true, brain);
      if (!a) { error = error || "Couldn't invent a new person just now — try again in a moment."; break; }
      people.push(a);
    } catch (e) {
      console.error("pica: new face", e instanceof Error ? e.message : e);
      error = missingSchema(e) ? "Picagram isn't fully set up on this database yet, so a new face couldn't be saved." : (e instanceof Error ? e.message : "Couldn't bring anyone new in.");
      break;
    }
  }
  const posted = await Promise.all(people.map(async (a, i) => {
    try {
      // ⏱️ She exists now; give her a post only if there is still time for one.
      if (Date.now() > until) { console.warn("pica: out of time before a post"); return ""; }
      const ok = await postFor(userId, a, u, Date.now() - (room - i) * rand(2, 12) * 60_000, undefined, true, brain);
      return ok ? String(a.name) : "";
    } catch (e) {
      console.error("pica: new face post", e instanceof Error ? e.message : e);
      error = error || (e instanceof Error ? e.message.replace(/ Tell them.*$/, "") : "Her photo didn't start.");
      return "";
    }
  }));
  const names = posted.filter(Boolean);
  const short = names.length < want ? (error || `Brought in ${names.length} of ${want}.`) : undefined;
  return { made: names.length, names, error: short };
}

/** One post from one account, with its photo, at the given moment. */
async function postFor(userId: string, a: Record<string, unknown>, u: U, at: number, plan?: { caption?: string; photo?: string }, strict = false, brain?: unknown, about = "", raw = false): Promise<boolean> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  const when = new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: u.tz });
  let caption = scrub(String(plan?.caption || "")).slice(0, 600), photo = scrub(String(plan?.photo || "")).slice(0, 600);
  if (!photo) {
    const w = await wordingFor(userId);
    const raw = await writeText(brain ?? await picaBrain(userId), `Today is ${when}. Write ONE Picagram post for @${a.handle} (${a.name}): ${a.bio}${a.personality ? ` — who she is: ${String(a.personality).slice(0, 400)}` : ""} — ${about || "a photo of her in her everyday life or her niche"}, with a caption — ${t.post_caption}. ${u.adult ? "Flattering, flirty and confident is fine; no nudity or lingerie." : "Family-friendly, fully clothed."} "photo" describes exactly what the picture shows (where, outfit, pose, light) in 1–2 sentences. ${w.no_looks} It follows this SHOT and TONE exactly so it doesn't look like her last one — SHOT: ${shotFor(`${a.id}:${when}`, rand(0, 9))}; TONE: ${TONES[toneFor(String(a.id), rand(0, 5), a.folk ? FOLK_SUGGESTIVE : hash(`${a.id}:how`) % 9, u.adult)]}. ${PLAIN_WORDS} JSON only: {"caption":"...","photo":"..."}`,
      `She looks like: ${a.look}`, 1000, THINK).catch(() => "");
    // A blurb you wrote yourself stays yours — only what you left blank is filled in.
    try { const j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); if (!caption) caption = scrub(String(j.caption || "✨")).slice(0, 600); photo = scrub(String(j.photo || "")).slice(0, 600); } catch { /* fall back below */ }
  }
  if (!photo) photo = plainFacePhoto(String(a.name));
  const refs = await refsOf(a);
  // ✍️ A photo you described yourself goes to the picture service word for word, the way the
  // popup prompts and group photos do — her own pictures still carry her face.
  const shoot = (description: string) => startMedia(userId, { kind: "image", with_me: true, they_asked: true, description },
    { characterId: null, who: String(a.name), appearance: String(a.look), refs, romantic: u.adult, offer: false, other: null, pica: true, ...(raw && refs.length ? { raw: true } : {}) });
  let media = await shoot(photo).catch((e: unknown) => e);
  // A description that mentions lingerie (even to forbid it) is refused. One plain retry still makes her face.
  if (media instanceof Error) {
    const fallback = plainFacePhoto(String(a.name));
    photo = fallback;
    media = await shoot(fallback).catch((e: unknown) => e);
  }
  if (media instanceof Error || !media || typeof media !== "object" || !("id" in media)) {
    const why = media instanceof Error ? media.message.replace(/ Tell them.*$/, "") : "Her photo didn't start.";
    if (strict) throw new PicaLimit(why);
    console.error("pica: photo", why);
    return false;
  }
  const made = media as Media;
  if (!a.avatar_media_id) await sql()`update pica_accounts set avatar_media_id = ${made.id} where id = ${String(a.id)}`;
  const likes = Math.max(150, Math.min(25000, Math.round(Number(a.followers) * (0.005 + Math.random() * 0.03))));
  const [post] = await sql()`insert into pica_posts (user_id, account_id, kind, caption, photo, media_id, likes_target, created_at)
    values (${userId}, ${String(a.id)}, 'image', ${caption || "✨"}, ${photo}, ${made.id}, ${likes}, ${new Date(at).toISOString()}) returning id`;
  for (const c of randomComments(`${caption} ${photo}`, "image", rand(3, 5)))
    await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${c.name}, ${c.text}, ${new Date(at + rand(2, 300) * 60_000).toISOString()})`;
  return true;
}

/** 🆕 A post you asked for: one of the people already on Picagram, in the setting you picked —
 *  or your own words for the picture and the caption, posted as whoever you choose. */
export async function picaNewPost(userId: string, want: { accountId?: string; setting?: string; caption?: string; photo?: string }): Promise<{ who: string; handle: string }> {
  const u = await userInfo(userId);
  const id = String(want.accountId || "");
  // At random: the ones you follow first, and ones with pictures of their own before ones
  // without, so the face in the post is really hers.
  // Whoever you picked — by her Picagram account, or by the character she is. Her @handle and her
  // Picagram name are yours to change, and neither is how she's found: the account's own id, or
  // the character she's linked to, is. Renaming her can't lose her.
  const [a] = id
    ? await sql()`select * from pica_accounts where user_id = ${userId} and not mine and (id = ${id} or character_id = ${id}) limit 1`
    : await sql()`select * from pica_accounts where user_id = ${userId} and not mine
        order by (avatar_media_id is not null) desc, followed desc, random() limit 1`;
  if (!a) throw new PicaLimit(id ? "She isn't on Picagram — put her up from her own chat first." : "There's nobody on Picagram yet.");
  const photo = scrub(String(want.photo || "")).replace(/\s+/g, " ").trim().slice(0, 600);
  const caption = scrub(String(want.caption || "")).trim().slice(0, 600);
  const mine = !!photo;
  // 🎚️ What you picked it to be about. Suggestive is only on offer once 18+ is confirmed.
  const setting = String(want.setting || "random");
  const about = mine ? "" : setting === "work" ? "a photo of her at work, in what she really wears for it"
    : setting === "class" ? "a photo of her at school — in class, on campus or studying"
    : setting === "suggestive" && u.adult ? "a photo of her looking her best, flirty and confident"
    : "";
  const ok = await postFor(userId, a, u, Date.now(), mine || caption ? { caption, photo } : undefined, true,
    undefined, about, mine);
  if (!ok) throw new PicaLimit("Her photo didn't start.");
  return { who: String(a.name), handle: String(a.handle || "") };
}

export class PicaLimit extends Error {}
export async function picaFollow(userId: string, accountId: string, on: boolean): Promise<boolean> {
  if (on) {
    const [{ n }] = await sql()`select count(*)::int as n from pica_accounts where user_id = ${userId} and followed and character_id is null and id <> ${accountId}`;
  }
  const r = await sql()`update pica_accounts set followed = ${on}, followers = followers + ${on ? 1 : -1} where id = ${accountId} and user_id = ${userId} returning id, character_id, name`;
  if (!r.length) return false;
  // 👀 She can see who follows her: unfollowing a friend is something she notices and may bring up.
  const [a] = r;
  if (a.character_id) await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${a.character_id}, 'fact',
    ${on ? `He followed me again on Picagram.` : `He unfollowed me on Picagram — I noticed, and I'm not sure why.`})`;
  return true;
}

/** 👤 Someone's profile: who she is and her photos. */
/**
 * 🪪 Every character who posts has a page of her own. Characters you made yourself never had a
 * Picagram account behind them, so there was nothing to open: the first time you look, hers is
 * made from her card and her posts join it.
 */
export async function accountFor(userId: string, characterId: string): Promise<string | null> {
  const [c] = await sql()`select id, name, job, personality, big_following from chat_characters
    where id = ${characterId} and (owner_id is null or owner_id = ${userId})`;
  if (!c) return null;
  const [had] = await sql()`select id from pica_accounts where user_id = ${userId} and character_id = ${c.id}`;
  if (had) {
    await sql()`update pica_posts set account_id = ${had.id} where user_id = ${userId} and author_id = ${c.id} and account_id is null`;
    return String(had.id);
  }
  // 🙋 She may already be on Picagram under her own name — invented as one of the new faces, say,
  // before she was ever a character. Take that account over rather than making a second her with a
  // handle like @Lea2: only when exactly one account carries the name and nobody else holds it.
  const [same] = await sql()`select id from pica_accounts where user_id = ${userId} and character_id is null
    and lower(name) = lower(${String(c.name)})
    and (select count(*) from pica_accounts a2 where a2.user_id = ${userId} and lower(a2.name) = lower(${String(c.name)})) = 1
    limit 1`;
  if (same) {
    await sql()`update pica_accounts set character_id = ${c.id}, followed = true where id = ${String(same.id)}`;
    await sql()`update pica_posts set account_id = ${String(same.id)} where user_id = ${userId} and author_id = ${c.id} and account_id is null`;
    await sql()`update pica_posts set author_id = ${c.id} where user_id = ${userId} and account_id = ${String(same.id)} and author_id is null`;
    // 🖼️ Her face on Picagram becomes the headshot from her character card, so a linked account is
    // recognisably her at a glance (and you can tell it took).
    await sql()`update pica_accounts a set avatar_media_id = p.id
      from chat_characters c, lateral (select m.id from velo_media m
        where m.file_id = c.portrait_file_id and m.user_id = ${userId} and m.status = 'done'
        order by m.created_at desc limit 1) p
      where a.id = ${String(same.id)} and c.id = ${c.id} and c.portrait_file_id is not null`;
    return String(same.id);
  }
  // Her handle keeps her name's capitals (@RaeMori) — it's her name, not a label.
  const taken = new Set((await sql()`select handle from pica_accounts where user_id = ${userId}`).map(r => String(r.handle).toLowerCase()));
  let handle = String(c.name).replace(/[^A-Za-z0-9._]/g, "").slice(0, 24) || "friend";
  while (taken.has(handle.toLowerCase()) || handle.length < 2) handle = `${handle.replace(/\d+$/, "")}${rand(1, 99)}`.slice(0, 28);
  // Her newest picture stands in as her profile picture until you change it.
  const [av] = await sql()`select m.id from pica_posts p join velo_media m on m.id = p.media_id
    where p.user_id = ${userId} and p.author_id = ${c.id} and m.status = 'done' order by p.created_at desc limit 1`;
  const [acc] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, followers, followed, character_id, avatar_media_id)
    values (${userId}, ${handle}, ${String(c.name).slice(0, 60)}, ${scrub(String(c.job || "")).slice(0, 300)}, '', ${c.big_following ? rand(40000, 400000) : rand(400, 9000)}, true, ${c.id}, ${av?.id || null}) returning id`;
  await sql()`update pica_posts set account_id = ${acc.id} where user_id = ${userId} and author_id = ${c.id} and account_id is null`;
  await ensurePersona(userId, String(acc.id)).catch(() => {});
  return String(acc.id);
}

export async function picaProfile(userId: string, accountId: string) {
  const [a] = await sql()`select a.id, a.handle, a.name, a.bio, a.personality, a.traits, a.followers, a.followed, a.character_id, a.lives, a.mine, a.ref_media_ids, a.avatar_media_id, f.url as avatar, coalesce(ch.pica_hidden, false) as hidden, ch.attached
    , pf.url as portrait
    from pica_accounts a left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id left join chat_characters ch on ch.id = a.character_id
      left join velo_files pf on pf.id = ch.portrait_file_id
    where a.id = ${accountId} and a.user_id = ${userId}`;
  if (!a) return null;
  // 🎭 No description yet: she's given one now, and it's yours to change.
  if (!a.character_id && !String(a.personality || "").trim()) {
    await ensurePersona(userId, String(a.id)).catch(e => console.error("pica: personality", e instanceof Error ? e.message : e));
    const [again] = await sql()`select personality, traits from pica_accounts where id = ${a.id}`;
    if (again) { a.personality = again.personality; a.traits = again.traits; }
  }
  // 🖼️ One you made yourself: make sure the pictures you gave her are up as posts (older ones weren't).
  if (a.mine && Array.isArray(a.ref_media_ids) && a.ref_media_ids.length)
    await putUpUploads(userId, a, (a.ref_media_ids as string[]).map(String), await userInfo(userId)).catch(e => console.error("pica: catch up her pictures", e instanceof Error ? e.message : e));
  const posts = await sql()`select p.id, p.caption, p.created_at::text as at, m.id as media_id, f.url, t.url as thumb, exists(select 1 from pica_saved s where s.user_id = p.user_id and s.media_id = m.id) as saved
    from pica_posts p join velo_media m on m.id = p.media_id join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where p.user_id = ${userId} and (p.account_id = ${accountId} or (${a.character_id || null}::uuid is not null and p.author_id = ${a.character_id || null}::uuid))
      and p.created_at <= now() and m.status = 'done' order by p.created_at desc limit 60`;
  const refIds = ((a.ref_media_ids || []) as string[]).map(String).filter(Boolean);
  const refRows = refIds.length ? await sql()`select m.id, f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = any(${refIds}::uuid[]) and m.user_id = ${userId}` : [];
  return { refs: refIds.map(id => refRows.find(r => String(r.id) === id)).filter(Boolean).map(r => ({ media_id: String(r!.id), url: String(r!.url) })),
    account: { id: String(a.id), handle: String(a.handle), name: String(a.name), bio: String(a.bio),
      personality: String(a.personality || ""), traits: cleanTraits(a.traits && Object.keys(a.traits).length ? a.traits : DEFAULT_TRAITS), followers: Number(a.followers), followed: !!a.followed, avatar: a.avatar ? String(a.avatar) : a.portrait ? String(a.portrait) : null, avatar_media_id: a.avatar_media_id ? String(a.avatar_media_id) : null, character_id: a.character_id ? String(a.character_id) : null, lives: a.lives ? String(a.lives) : "", hidden: !!a.hidden, married: a.attached === "married" },
    photos: posts.map(r => ({ post_id: String(r.id), media_id: String(r.media_id), url: String(r.url), thumb: r.thumb ? String(r.thumb) : null, caption: String(r.caption || ""), saved: !!r.saved })) };
}

/**
 * 🎭 Everyone gets one. A woman on Picagram who has no description yet is given one — written from
 * her bio, her look and where she lives — the first time you open her, and it's yours to edit from
 * then on. Someone you've befriended is skipped: hers live on her character card.
 */
export async function ensurePersona(userId: string, accountId: string): Promise<void> {
  const [a] = await sql()`select id, name, handle, bio, look, lives, personality, character_id, folk from pica_accounts
    where id = ${accountId} and user_id = ${userId}`;
  if (!a || a.character_id || String(a.personality || "").trim()) return;
  const raw = await writeText(await picaBrain(userId), `Write the personality of ONE woman who posts on Picagram, from her profile below — the way her owner would write it for a companion app.
"personality": 2–4 sentences on how she talks and acts: her manner, what she's like to message, what she talks about, what she's guarded about. Specific and human, not a list of adjectives.
"traits": a number 0–10 for each of ${TRAITS.map(t => t.key).join(", ")} — fit them to her (suggestive at most 4, language at most 3).
${a.folk ? "She's an ordinary person rather than an influencer: keep her plain and real, and keep suggestive at 0 or 1." : ""}
JSON only: {"personality":"...","traits":{${TRAITS.map(t => `"${t.key}":5`).join(",")}}}`,
    `@${a.handle} (${a.name})\nBio: ${a.bio || "(none)"}\nLooks: ${a.look || "(not said)"}${a.lives ? `\nLives: ${a.lives}` : ""}`, 900, THINK).catch(() => "");
  let j: { personality?: string; traits?: unknown } = {};
  try { j = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { return; }
  const text = scrub(String(j.personality || "")).replace(/\s+/g, " ").trim().slice(0, 2000);
  if (text.length < 10) return;
  await sql()`update pica_accounts set personality = ${text}, traits = ${JSON.stringify(cleanTraits(j.traits))}::jsonb
    where id = ${a.id} and user_id = ${userId} and coalesce(personality, '') = ''`;
}

/** ✍️ The words under a post — anyone's, yours to fix. */
export async function picaCaption(userId: string, postId: string, caption: string): Promise<string | null> {
  const text = scrub(caption).slice(0, 2000);
  const rows = await sql()`update pica_posts set caption = ${text} where id = ${postId} and user_id = ${userId} returning id`;
  return rows.length ? text : null;
}

/** ✍️ Her @handle, yours to change — never one already taken. Her Picagram username is her own,
 *  not her character card's: linking her to a character doesn't take it away from you. */
export async function picaHandle(userId: string, accountId: string, handle: string): Promise<string | "friend" | "taken" | null> {
  const [a] = await sql()`select id, character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
    const text = String(handle || "").replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 28);
  if (text.length < 2) return null;
  const [clash] = await sql()`select 1 from pica_accounts where user_id = ${userId} and id <> ${a.id} and lower(handle) = lower(${text})`;
  if (clash) return "taken";
  await sql()`update pica_accounts set handle = ${text} where id = ${a.id} and user_id = ${userId}`;
  return text;
}

/** ✍️ Her name on Picagram, yours to change. It belongs to the account, so it stays yours to set
 *  even once she's a character — her character card keeps its own name. */
export async function picaName(userId: string, accountId: string, name: string): Promise<string | "friend" | null> {
  const [a] = await sql()`select id, character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
    const text = scrub(name).replace(/\s+/g, " ").trim().slice(0, 60);
  if (!text) return null;
  await sql()`update pica_accounts set name = ${text} where id = ${a.id} and user_id = ${userId}`;
  return text;
}

/**
 * 🖼️ Her reference pictures: the ones every new picture of her is built from, so her face stays
 * hers. Pick from her own photos or upload your own, the same as a character's. Not for someone
 * you've befriended — hers live on her character card.
 */
export async function picaRefs(userId: string, accountId: string, mediaIds: string[]): Promise<{ refs: { media_id: string; url: string }[] } | "friend" | null> {
  const [a] = await sql()`select id, character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
  if (a.character_id) return "friend";
  const want = [...new Set(mediaIds.filter(x => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 4);
  const rows = want.length
    ? await sql()`select m.id, f.url from velo_media m join velo_files f on f.id = m.file_id
        where m.id = any(${want}::uuid[]) and m.user_id = ${userId} and m.kind = 'image' and m.status = 'done'`
    : [];
  const keep = want.filter(id => rows.some(r => String(r.id) === id));
  await sql()`update pica_accounts set ref_media_ids = ${keep}::uuid[] where id = ${a.id} and user_id = ${userId}`;
  return { refs: keep.map(id => ({ media_id: id, url: String(rows.find(r => String(r.id) === id)!.url) })) };
}

/** 📍 Where she lives, yours to change — the same rule as her personality: not once she's a character. */
export async function picaLives(userId: string, accountId: string, lives: string): Promise<string | "friend" | null> {
  const [a] = await sql()`select id, character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
  if (a.character_id) return "friend";
  const text = scrub(lives).replace(/\s+/g, " ").trim().slice(0, 120);
  await sql()`update pica_accounts set lives = ${text || null} where id = ${a.id} and user_id = ${userId}`;
  return text;
}

/**
 * 🎭 Her personality: a description and the nine sliders, yours to write. Never for someone you've
 * befriended — she's a character now, so hers live on her character card.
 */
export async function picaPersona(userId: string, accountId: string, personality: string, traits: unknown): Promise<{ personality: string; traits: Record<string, number> } | "friend" | null> {
  const [a] = await sql()`select id, character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
  if (a.character_id) return "friend";
  const text = scrub(personality).slice(0, 2000);
  const t = cleanTraits(traits);
  await sql()`update pica_accounts set personality = ${text}, traits = ${JSON.stringify(t)}::jsonb where id = ${a.id} and user_id = ${userId}`;
  return { personality: text, traits: t };
}

/**
 * 🖼️ Her profile picture, on its own. Any picture of hers — one of her posts, or one you upload
 * just for this — becomes her avatar without touching her posts or deleting anything.
 */
export async function picaSetAvatar(userId: string, accountId: string, mediaId: string): Promise<string | null> {
  const [a] = await sql()`select id, ref_media_ids, mine from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return null;
  const [m] = await sql()`select m.id, f.url from velo_media m join velo_files f on f.id = m.file_id
    where m.id = ${mediaId} and m.user_id = ${userId} and m.kind = 'image' and m.status = 'done'`;
  if (!m) return null;
  await sql()`update pica_accounts set avatar_media_id = ${m.id} where id = ${a.id} and user_id = ${userId}`;
  // 🪪 One you made by hand keeps her face steady from her own pictures: the new one joins them.
  if (a.mine && !((a.ref_media_ids || []) as string[]).includes(String(m.id)))
    await sql()`update pica_accounts set ref_media_ids = (coalesce(ref_media_ids, '{}'::uuid[]) || ${m.id}::uuid)[1:6] where id = ${a.id}`;
  return String(m.url);
}

/** 🔖 Their own Picagram gallery: pictures they saved. */
export async function picaSave(userId: string, mediaId: string, on: boolean): Promise<boolean> {
  // 🔖 Any Picagram picture of yours can be kept: one from a post, one she sent you in a DM, or
  // one you uploaded for her profile. It only has to be yours and finished.
  const [m] = await sql()`select 1 from velo_media where id = ${mediaId} and user_id = ${userId} and kind = 'image' and status <> 'declined' limit 1`;
  if (!m) return false;
  if (on) await sql()`insert into pica_saved (user_id, media_id) values (${userId}, ${mediaId}) on conflict do nothing`;
  else await sql()`delete from pica_saved where user_id = ${userId} and media_id = ${mediaId}`;
  return true;
}
export async function picaSavedList(userId: string, before: string | null) {
  const rows = await sql()`select s.media_id, s.created_at::text as at, f.url, t.url as thumb from pica_saved s join velo_media m on m.id = s.media_id join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where s.user_id = ${userId} and (${before}::timestamptz is null or s.created_at < ${before}::timestamptz) order by s.created_at desc limit 30`;
  return rows.map(r => ({ media_id: String(r.media_id), url: String(r.url), thumb: r.thumb ? String(r.thumb) : null, at: String(r.at), saved: true }));
}

/** 👤 Your own Picagram: your bio, your picture, and everything you've posted. */
export async function picaMe(userId: string) {
  const [u] = await sql()`select u.name, u.pica_bio, f.url as avatar, f2.url as bio_photo from users u
    left join velo_files f on f.id = u.pica_avatar_file_id left join velo_files f2 on f2.id = u.bio_photo_file_id where u.id = ${userId}`;
  const posts = await sql()`select p.id, p.caption, p.created_at::text as at, m.id as media_id, f.url, t.url as thumb,
      exists(select 1 from pica_saved s where s.user_id = p.user_id and s.media_id = m.id) as saved
    from pica_posts p join velo_media m on m.id = p.media_id join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where p.user_id = ${userId} and p.author_id is null and p.account_id is null and m.status = 'done' order by p.created_at desc limit 60`;
  const [{ n }] = await sql()`select count(*)::int as n from pica_posts where user_id = ${userId} and author_id is null and account_id is null`;
  const [{ f }] = await sql()`select count(*)::int as f from pica_accounts where user_id = ${userId} and followed`;
  return { name: String(u?.name || "You"), bio: String(u?.pica_bio || ""),
    avatar: u?.avatar ? String(u.avatar) : u?.bio_photo ? String(u.bio_photo) : null, posts: Number(n), following: Number(f),
    photos: posts.map(r => ({ post_id: String(r.id), media_id: String(r.media_id), url: String(r.url), thumb: r.thumb ? String(r.thumb) : null, caption: String(r.caption || ""), at: String(r.at), saved: !!r.saved })) };
}

/** ✍️ Your Picagram bio, in your own words. */
/** ✍️ Her bio, as you want it — yours to write for anyone on your Picagram. */
export async function picaBio(userId: string, accountId: string, bio: string): Promise<string | null> {
  const text = scrub(bio).slice(0, 300);
  const rows = await sql()`update pica_accounts set bio = ${text} where id = ${accountId} and user_id = ${userId} returning id`;
  return rows.length ? text : null;
}

export async function picaMeBio(userId: string, bio: string): Promise<string> {
  const text = scrub(bio).slice(0, 300);
  await sql()`update users set pica_bio = ${text}, updated_at = now() where id = ${userId}`;
  return text;
}

/** 🙈 Characters on Picagram, and whether you've hidden their posts. */
export async function picaCharacters(userId: string) {
  const rows = await sql()`select c.id, c.name, c.pica_hidden, f.url as portrait from chat_characters c left join velo_files f on f.id = c.portrait_file_id
    where (c.owner_id is null or c.owner_id = ${userId}) order by c.name`;
  return rows.map(r => ({ id: String(r.id), name: String(r.name), portrait: r.portrait ? String(r.portrait) : null, hidden: !!r.pica_hidden }));
}

/** 🙈 Hide (or show) a character's posts. She can't tell — unlike unfollowing her. */
export async function picaHide(userId: string, characterId: string, on: boolean): Promise<boolean> {
  const r = await sql()`update chat_characters set pica_hidden = ${on} where id = ${characterId} and (owner_id is null or owner_id = ${userId}) returning id`;
  return r.length > 0;
}

/** 👥 Who they follow (up to 70), to unfollow some. */
export async function picaFollowing(userId: string) {
  const rows = await sql()`select a.id, a.handle, a.name, a.character_id, ch.attached, ch.name as real_name, f.url as avatar from pica_accounts a
    left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id left join chat_characters ch on ch.id = a.character_id
    where a.user_id = ${userId} and a.followed order by a.name`;
  // 🪪 Her own name as well as her Picagram one: a @handle is hers to change whenever she likes,
  // so anything that needs to say who she IS uses the name on her character card.
  return rows.map(r => ({ id: String(r.id), handle: String(r.handle), name: String(r.name), real_name: r.real_name ? String(r.real_name) : null, avatar: r.avatar ? String(r.avatar) : null, friend: !!r.character_id, character_id: r.character_id ? String(r.character_id) : null, married: r.attached === "married" }));
}

/** 🤝 Befriend her: she becomes a character (filled in for them; her photos are her headshot and references). */
export async function picaBefriend(userId: string, accountId: string, brain?: string): Promise<string> {
  const [a] = await sql()`select * from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) throw new PicaLimit("That account wasn't found.");
  if (a.character_id) { const [c] = await sql()`select id from chat_characters where id = ${a.character_id}`; if (c) return String(c.id); }
  const u = await userInfo(userId);
  const photos = (await sql()`select m.id, m.file_id from pica_posts p join velo_media m on m.id = p.media_id where p.user_id = ${userId} and p.account_id = ${accountId} and m.status = 'done' order by p.created_at desc limit 4`);
  const [av] = a.avatar_media_id ? await sql()`select file_id from velo_media where id = ${a.avatar_media_id} and status = 'done'` : [];
  const names = (await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => String(r.name));
  const first = String(a.name).split(/\s+/)[0];
  const d0 = await makeCharacter({ userId, brain, words: await wordsFor(userId), name: names.includes(first) ? String(a.name) : first, vibe: `She posts on Picagram as @${a.handle}: "${a.bio}". Looks: ${a.look}. You two just became friends after you followed her on Picagram.`, romantic: u.adult, male: false, avoidNames: await usedNames(userId).catch(() => []), lives: a.lives ? `WHERE SHE LIVES: ${a.lives} — keep it exactly.` : livesNote(await homeOf(userId)), lesbian: !!a.lesbian });
  // 🎭 Her personality and her sliders are yours — whatever you wrote on her Picagram page wins.
  const yours = String(a.personality || "").trim();
  const hadTraits = a.traits && Object.keys(a.traits as object).length > 0;
  const d = { ...d0, personality: yours || d0.personality, traits: hadTraits ? cleanTraits(a.traits) : d0.traits };
  const [c] = await sql()`insert into chat_characters (created_by, owner_id, intro_status, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, birthday, time_zone, work_attire, work_days, work_start, work_end, part_time, lesbian, lesbian_personality, portrait_file_id, reference_ids, lives_in)
    values (${userId}, ${userId}, 'accepted', ${d.name}, ${d.personality}, ${d.backstory}, ${scrub(`Someone you met on Picagram (@${a.handle}) — you followed her and became friends`)}, ${scrub(String(a.look || d.appearance)).slice(0, 600)}, ${d.job}, ${d.casual_wear}, ${d.hobbies}, ${d.voice}, ${d.voice_name}, ${d.voice_kind}, ${d.romantic}, ${d.romance_arc}, ${JSON.stringify(d.traits)}::jsonb, ${d.birthday}, '',
      ${d.work_attire}, ${d.work_days}::int[], ${d.work_start}, ${d.work_end}, ${d.part_time}, ${!!d.lesbian}, ${d.lesbian_personality || ""}, ${av?.file_id || photos[0]?.file_id || null}, ${photos.map(p => String(p.id))}::uuid[], ${String(a.lives || d.lives_in || "").slice(0, 120)}) returning id`;
  // Her pictures are hers now (her gallery and references), and she keeps posting as a character.
  if (photos.length) await sql()`update velo_media set character_id = ${c.id} where id = any(${photos.map(p => String(p.id))}::uuid[]) and user_id = ${userId}`;
  await sql()`update pica_accounts set character_id = ${c.id}, followed = true where id = ${accountId}`;
  // 🧠 Everyone who knows her learns her Picagram name.
  await sql()`insert into velo_memories (user_id, character_id, kind, text) select ${userId}, character_id, 'fact',
      ${`Her name is ${a.name} — on Picagram she's @${a.handle}.`.slice(0, 600)} from velo_media where user_id = ${userId} and id = ${a.avatar_media_id} and character_id is not null`;
  // 🧠 Her brain and what she remembers from your DMs come with her.
  if (a.brain) await sql()`update chat_characters set brain = ${String(a.brain)} where id = ${c.id}`;
  const mem = await sql()`delete from pica_memories where user_id = ${userId} and account_id = ${accountId} returning text, created_at`;
  for (const m of mem) await sql()`insert into velo_memories (user_id, character_id, kind, text, created_at) values (${userId}, ${c.id}, 'fact', ${String(m.text)}, ${m.created_at})`;
  const [dm] = await sql()`select count(*)::int as n from pica_dms where user_id = ${userId} and account_id = ${accountId}`;
  if (Number(dm?.n) > 0) await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${c.id}, 'fact', ${`We met on Picagram (I'm @${a.handle} there) and chatted in DMs before becoming friends.`})`;
  await sql()`update pica_posts set author_id = ${c.id} where account_id = ${accountId} and user_id = ${userId}`;
  return String(c.id);
}

/** 🔄 Likes and comments right now, for posts still collecting them. */
export async function picaCounts(userId: string, ids: string[]) {
  const want = ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10);
  if (!want.length) return [];
  const rows = await sql()`select p.id, p.likes_target, p.liked, p.liked_by, p.liker_secs, p.created_at::text as at,
      (select count(*)::int from pica_comments k where k.post_id = p.id and k.created_at <= now()) as n
    from pica_posts p where p.user_id = ${userId} and p.id = any(${want}::uuid[])`;
  return rows.map(r => {
    const liked_by = likersNow((r.liked_by || []) as string[], (r.liker_secs || []) as number[], String(r.at));
    return { id: String(r.id), likes: Math.max(ramp(Number(r.likes_target), String(r.at), String(r.id)), liked_by.length) + (r.liked ? 1 : 0), liked_by, comments: Number(r.n) };
  });
}

/** 🗑 Delete one of their own posts: its comments and photo go too, and the people who saw it forget it. */
/**
 * 🗑 Take a post down — yours, one of your characters', or one from someone on Picagram.
 *
 * `alsoPicture` says whether the picture goes with it. Left alone, the post disappears and the
 * picture stays in your gallery, which is what you want when you liked the photo and not the post.
 */
export async function picaDeletePost(userId: string, postId: string, alsoPicture = true): Promise<boolean> {
  const [p] = await sql()`delete from pica_posts where id = ${postId} and user_id = ${userId} returning caption, photo, media_id`;
  if (!p) return false;
  if (alsoPicture && p.media_id) await deleteMedia(userId, String(p.media_id)).catch(() => false);
  const cap = String(p.caption || ""), desc = String(p.photo || "");
  const needle = cap ? `posted on Picagram: "${cap.slice(0, 160)}"` : desc ? `(a photo: ${desc.slice(0, 160)})` : "";
  if (needle) await sql()`delete from velo_memories where user_id = ${userId} and position(${needle} in text) > 0`;
  return true;
}

/** 🗑 Delete any Picagram account: her, her posts, her DMs and her pictures.
 *  Anything you saved to your own gallery stays. If you've befriended her, only the Picagram side
 *  goes — she stays a character, with her gallery, and you delete her from her card if you want to. */
export async function picaDeleteAccount(userId: string, accountId: string): Promise<"gone" | "friend" | "unknown"> {
  const [a] = await sql()`select character_id from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) return "unknown";
  if (a.character_id) return "friend"; // she's a character — hide her instead.
  // Her pictures, except the ones they saved (those are theirs now) and any that belong to her as a character.
  const mine = await sql()`select distinct m.id from velo_media m
    left join pica_posts p on p.media_id = m.id
    where m.user_id = ${userId} and m.character_id is null and (p.account_id = ${accountId} or m.id = (select avatar_media_id from pica_accounts where id = ${accountId}))
      and not exists (select 1 from pica_saved s where s.user_id = ${userId} and s.media_id = m.id)`;
  // Her DM photos too.
  const dms = await sql()`select d.media_id as id from pica_dms d where d.user_id = ${userId} and d.account_id = ${accountId} and d.media_id is not null
    and not exists (select 1 from pica_saved s where s.user_id = ${userId} and s.media_id = d.media_id)`;
  await sql()`delete from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  for (const m of [...mine, ...dms]) await deleteMedia(userId, String(m.id)).catch(() => false);
  return "gone";
}

/** 🔴 New posts since they last looked at Picagram (not their own). */
export async function picaNew(userId: string): Promise<number> {
  const [r] = await sql()`select count(*)::int as n from pica_posts p join users u on u.id = p.user_id
    where p.user_id = ${userId} and u.pica_looked_at is not null and p.created_at > u.pica_looked_at and p.created_at <= now() and (p.author_id is not null or p.account_id is not null)`;
  return Number(r?.n || 0);
}

/** ✨ "Create social" under a photo a character sent of someone (not a character, not on Picagram yet):
 *  she gets a Picagram account with that photo as her picture — then she can be befriended like any account. */
export async function picaFromPhoto(userId: string, mediaId: string): Promise<string> {
  const t = await wordsFor(userId); // 🛠️ Admin → Messaging & wording
  const [m] = await sql()`select m.id, m.subject, m.description, m.character_id, c.name as sender from velo_media m left join chat_characters c on c.id = m.character_id
    where m.id = ${mediaId} and m.user_id = ${userId} and m.kind = 'image' and m.status = 'done'`;
  if (!m) throw new PicaLimit("That photo wasn't found.");
  const sub = String(m.subject || ""), desc = String(m.description || "");
  if (sub === "me" || sub.startsWith("me+")) throw new PicaLimit("That's a photo of them — it isn't someone new.");
  // An unnamed woman (or an older photo that didn't say who's in it): it has to show a woman, not one of your characters.
  const named = sub && sub !== "none" ? sub : "";
  const chars = (await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => String(r.name));
  // 🙋 One of your characters who's already on Picagram: open her rather than making a second her.
  if (named) {
    const [mine] = await sql()`select a.id from pica_accounts a join chat_characters c on c.id = a.character_id
      where a.user_id = ${userId} and lower(c.name) = lower(${named}) limit 1`;
    if (mine) return String(mine.id);
    if (chars.some(c => c.toLowerCase() === named.toLowerCase())) throw new PicaLimit(`${named} is already one of your characters — put her on Picagram from her own chat first.`);
  }
  if (!named && (!/\b(woman|girl|lady|she|her|blonde|brunette|redhead|model|babe)\b/i.test(desc) || chars.some(c => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(desc))))
    throw new PicaLimit("That photo isn't of someone new.");
  // Already made from this same photo (or she's on Picagram by name): open her.
  const [had] = await sql()`select id from pica_accounts where user_id = ${userId} and (avatar_media_id = ${m.id} or (${named} <> '' and lower(name) = lower(${named}))) limit 1`;
  if (had) return String(had.id);
  // 🙅 Everyone already here — her characters and everyone on her Picagram — so the new woman
  // isn't a second Chloe Hart.
  const here = (await sql()`select handle, name from pica_accounts where user_id = ${userId}`).map(r => ({ handle: String(r.handle), name: String(r.name) }));
  const used = [...here.map(h => h.name), ...chars];
  const check = [...here, ...chars.map(c => ({ handle: "", name: c }))];
  let a: { name?: string; handle?: string; bio?: string; look?: string; followers?: number } = {};
  // Two goes at a name nobody here already has; the second one is told what it clashed with.
  for (let go = 0, clash = ""; go < 2; go++) {
    const raw = await writeText(await picaBrain(userId), `Make a Picagram (a social photo app like Instagram) profile for this woman, from the photo of her. ${named ? "" : "Give her a first and last name too (fictional, not a celebrity, and not one already used below). "}Fictional details are fine. JSON only: {"name":"First Last","handle":"lowercase_handle","bio":"short bio with emojis","look":"${t.pica_look}","followers":12000}`,
      `${named ? `NAME: ${named}\n` : ""}THE PHOTO: ${desc.slice(0, 400)}${m.sender ? `\nSENT BY: ${m.sender} (who knows her)` : ""}\nALREADY TAKEN — avoid these names and surnames entirely: ${used.slice(0, 60).join(", ") || "(nobody yet)"}${clash ? `\nYour last try clashed with ${clash} — pick a completely different name.` : ""}`, 600).catch(() => "");
    try { a = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { a = {}; }
    if (named) break;
    const tryName = scrub(String(a.name || "")).replace(/\s+/g, " ").trim();
    if (!tryName) break;
    clash = tooClose(String(a.handle || ""), tryName, check);
    if (!clash) break;
    console.warn(`pica: ${tryName} is too close to ${clash} — trying again`);
    a.name = ""; a.handle = "";
  }
  const name = named || scrub(String(a.name || "")).replace(/\s+/g, " ").trim().slice(0, 60) || freshName(check);
  // Her handle keeps her name's capitals (@JulieWelsh) — it's her name, not a label.
  const taken = new Set((await sql()`select handle from pica_accounts where user_id = ${userId}`).map(r => String(r.handle).toLowerCase()));
  let handle = String(a.handle || name).replace(/[^A-Za-z0-9._]/g, "").slice(0, 24) || "newfriend";
  while (taken.has(handle.toLowerCase()) || handle.length < 2) handle = `${handle.replace(/\d+$/, "")}${rand(1, 99)}`.slice(0, 28);
  const [{ n }] = await sql()`select count(*)::int as n from pica_accounts where user_id = ${userId} and followed and character_id is null`;
  const [acc] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, followers, followed, avatar_media_id)
    values (${userId}, ${handle}, ${scrub(name).slice(0, 60)}, ${scrub(String(a.bio || "")).slice(0, 300)}, ${scrub(String(a.look || m.description || "")).slice(0, 600)}, ${Math.max(300, Math.min(900000, Number(a.followers) || rand(800, 30000)))}, true, ${m.id}) returning id`;
  // Her first post: the photo you liked.
  const [post] = await sql()`insert into pica_posts (user_id, account_id, kind, caption, photo, media_id, likes_target, created_at)
    values (${userId}, ${acc.id}, 'image', '✨', ${String(m.description || "").slice(0, 600)}, ${m.id}, ${rand(80, 900)}, now() - interval '3 hours') returning id`;
  for (const s of randomComments(String(m.description || ""), "image", rand(2, 4)))
    await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, now() - interval '2 hours')`;
  // 🧠 Whoever sent the photo knows her — and knows they're both on Picagram now.
  if (m.character_id) {
    const u = await userInfo(userId);
    await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${m.character_id}, 'fact',
      ${`Her name is ${name}. I sent ${u.name} a photo of her, and they found her on Picagram (she's @${handle} there).`.slice(0, 600)})`;
  }
  return String(acc.id);
}

/** ✍️ She was renamed: her Picagram account and everyone's memories of her follow the new name. */
export async function picaRenamed(userId: string, characterId: string, from: string, to: string): Promise<number> {
  const old = from.trim(), now = to.trim();
  if (!old || !now || old.toLowerCase() === now.toLowerCase()) return 0;
  await sql()`update pica_accounts set name = ${now.slice(0, 60)} where user_id = ${userId} and character_id = ${characterId}`;
  // Her name wherever it's written — but @handles are left exactly as they are (they're account names, not her name).
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = () => new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, "giu");
  const hide = (t: string) => { const keep: string[] = []; return { text: t.replace(/@[A-Za-z0-9._]+/g, m => `\u0000${keep.push(m) - 1}\u0000`), keep }; };
  const show = (t: string, keep: string[]) => t.replace(/\u0000(\d+)\u0000/g, (_m, i) => keep[Number(i)]);
  const word = (t: string) => re().test(hide(t).text);
  const swap = (t: string) => { const h = hide(t); return show(h.text.replace(re(), now), h.keep); };
  let n = 0;
  // Her own memories, and what everyone else remembers about her (chats, Picagram DMs, bonds, links).
  for (const r of await sql()`select id, text from velo_memories where user_id = ${userId} and position(lower(${old}) in lower(text)) > 0 limit 400`)
    if (word(String(r.text))) { await sql()`update velo_memories set text = ${swap(String(r.text)).slice(0, 600)}, updated_at = now() where id = ${r.id}`; n++; }
  for (const r of await sql()`select id, text from pica_memories where user_id = ${userId} and position(lower(${old}) in lower(text)) > 0 limit 200`)
    if (word(String(r.text))) { await sql()`update pica_memories set text = ${swap(String(r.text)).slice(0, 600)} where id = ${r.id}`; n++; }
  for (const r of await sql()`select user_id, a_id, b_id, story from chat_bonds where user_id = ${userId} and position(lower(${old}) in lower(story)) > 0 limit 200`)
    if (word(String(r.story))) { await sql()`update chat_bonds set story = ${swap(String(r.story)).slice(0, 600)} where user_id = ${userId} and a_id = ${r.a_id} and b_id = ${r.b_id}`; n++; }
  for (const r of await sql()`select knower_id, known_id, story from chat_character_links where position(lower(${old}) in lower(story)) > 0 limit 200`)
    if (word(String(r.story))) { await sql()`update chat_character_links set story = ${swap(String(r.story)).slice(0, 600)} where knower_id = ${r.knower_id} and known_id = ${r.known_id}`; n++; }
  // Her own story, and how she's described in other characters' stories.
  for (const r of await sql()`select id, backstory, relation, romance_arc from chat_characters where (owner_id is null or owner_id = ${userId})
      and (position(lower(${old}) in lower(backstory)) > 0 or position(lower(${old}) in lower(relation)) > 0 or position(lower(${old}) in lower(romance_arc)) > 0) limit 200`) {
    const b = String(r.backstory || ""), rel = String(r.relation || ""), arc = String(r.romance_arc || "");
    if (!word(b) && !word(rel) && !word(arc)) continue;
    await sql()`update chat_characters set backstory = ${swap(b).slice(0, 3000)}, relation = ${swap(rel).slice(0, 600)}, romance_arc = ${swap(arc).slice(0, 1500)}, updated_at = now() where id = ${r.id}`;
    n++;
  }
  return n;
}

/** 📸 Her own Picagram handle (when she came from an account), for her prompt. */
export async function picaHandleNote(userId: string, ch: { id: string; name: string }): Promise<string> {
  const [a] = await sql()`select handle from pica_accounts where user_id = ${userId} and character_id = ${ch.id}`;
  return a ? `📸 YOUR PICAGRAM: your name is ${ch.name}; on Picagram your handle is @${a.handle} (just your account name — people who know you call you ${ch.name.split(/\s+/)[0]}). That's how they found you; your posts and DMs there are yours, so talk about them naturally.` : "";
}

// 📸 Pictures of YOU: your "About you" photos (up to 4) are the references, and a peek-style
// description you can read and fix before anything is made.
export async function myPhotos(userId: string) {
  const [u] = await sql()`select bio_photo_file_id, (to_jsonb(users)->'bio_photo_notes') as bio_photo_notes from users where id = ${userId}`;
  const notes = (u?.bio_photo_notes && typeof u.bio_photo_notes === "object" ? u.bio_photo_notes : {}) as Record<string, string>;
  const rows = await sql()`select id, url, thumb_url from velo_files where user_id = ${userId} and kind = 'bio' order by created_at desc limit 6`;
  return rows.map(r => ({ id: String(r.id), url: String(r.thumb_url || r.url), note: String(notes[String(r.id)] || ""), main: String(r.id) === String(u?.bio_photo_file_id || "") }));
}
export async function myRefs(userId: string): Promise<string[]> {
  const rows = await sql()`select url from velo_files where user_id = ${userId} and kind = 'bio' order by created_at desc limit 4`;
  const refs = rows.map(r => String(r.url)).filter(x => /^https?:\/\//.test(x));
  if (refs.length) return refs;
  // No "About you" photos yet: fall back to your own recent Picagram photos.
  return (await sql()`select f.url from pica_posts p join velo_media m on m.id = p.media_id join velo_files f on f.id = m.file_id
    where p.user_id = ${userId} and p.author_id is null and p.account_id is null and m.status = 'done' order by p.created_at desc limit 3`)
    .map(r => String(r.url)).filter(x => /^https?:\/\//.test(x));
}
/** ✍️ Step 1: the picture's description, written for you to check and tweak (like a peek). */
export async function myPhotoDraft(userId: string, about: string, context: string): Promise<string> {
  const u = await userInfo(userId);
  const [row] = await sql()`select bio, bio_photo_note, bio_photo_notes from users where id = ${userId}`;
  const notes = (row?.bio_photo_notes && typeof row.bio_photo_notes === "object" ? row.bio_photo_notes : {}) as Record<string, string>;
  const look = [String(row?.bio_photo_note || ""), ...Object.values(notes)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" / ").slice(0, 600);
  const raw = await writeText(await picaBrain(userId), `You write the description for ONE photo of ${u.name} for an image generator — a photo they're about to share. Describe exactly what the picture shows: who's in it (them), where they are, what they're wearing, their pose and expression, the light. Match what they asked for. Use their look only for things a photo would show. ${u.adult ? "Flattering is fine; no nudity or lingerie." : "Family-friendly, fully clothed."} One or two sentences, under 300 characters, no names of real people, output only the description.`,
    `THEY WANT A PHOTO OF: ${about || "them, right now"}\nWHAT THEY LOOK LIKE: ${look || row?.bio || "(no photo described yet)"}\n${context ? `WHERE IT'S GOING: ${context}` : ""}`, 300).catch(() => "");
  const text = raw.replace(/\s+/g, " ").trim();
  return text.slice(0, 380) || `${about || "A photo of me"}${look ? ` — ${look.slice(0, 160)}` : ""}, natural light, candid`;
}
/** 📸 Step 2: exactly that description, straight to the picture service, with your photos as reference. */
export async function myPhotoMake(userId: string, description: string): Promise<Media> {
  const u = await userInfo(userId);
  const desc = scrub(description.replace(/\s+/g, " ").trim()).slice(0, 1500);
  if (desc.length < 5) throw new PicaLimit("Describe the photo in a few words first.");
  return startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: desc },
    { characterId: null, who: u.name, appearance: u.look, refs: await myRefs(userId), romantic: u.adult, offer: false, other: null, pica: true, raw: true });
}
