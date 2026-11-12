// 📸 Picagram: a pretend Instagram for each person's world. Every day 3–5 characters post (2–3 photos,
// the rest text), strangers and friends like and comment, and the person can post too. Posts keep
// coming even on days they don't look. Characters know about it: their own posts (and whether the
// person saw, liked or commented), the person's posts, and when they're out of town on vacation.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { listCharacters, referenceUrls, type Character } from "./characters";
import { startMedia, MediaError, type Media } from "./media";
import { allowsSuggestive, mediaMood } from "./traits";
import { isValidTimeZone, localDate, zonedParts, zonedToUtc } from "./localTime";
import { randomComments } from "./picaComments";
import { makeCharacter } from "./makeCharacter";

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
  const [r] = await sql()`select place, until::text from chat_away where user_id = ${userId} and character_id = ${characterId} and until >= current_date - 1`;
  if (!r) return null;
  const { tz } = await userInfo(userId);
  return String(r.until) >= localDate(Date.now(), tz) ? { place: String(r.place), until: String(r.until) } : null;
}
export const awayText = (name: string, a: { place: string; until: string }) =>
  `${name} is out of town${a.place ? ` (${a.place})` : ""} until ${new Date(`${a.until}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} — no meeting up in person till then.`;

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
    if (i === 0 && hour < 7) continue; // today's posts start in the morning
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

type Planned = { author: string; kind: "image" | "text"; caption: string; photo: string; with: string; vacation: { place: string; days: number } | null; friend_comments: { from: string; text: string }[] };

async function generateDay(userId: string, day: string, isToday: boolean): Promise<boolean> {
  const chars = (await listCharacters(userId)).filter(c => !c.owner_id || c.owner_id === userId);
  const u = await userInfo(userId);
  // 💃 Other accounts (people they follow, plus someone new to discover).
  await accountPosts(userId, day, isToday, u).catch(e => console.error("pica: accounts", e instanceof Error ? e.message : e));
  if (!chars.length) return true;
  const authors = shuffle(chars).slice(0, Math.min(rand(3, 5), chars.length));
  const links = new Map<string, { knows: string[]; knownBy: string[] }>();
  const info = await Promise.all(authors.map(async c => {
    // Only characters linked in their character cards: who she knows (could be in her photo), and who knows her (could comment).
    const knows = (await sql()`select known_id from chat_character_links where knower_id = ${c.id}`).map(r => chars.find(x => x.id === String(r.known_id))?.name).filter((n): n is string => !!n).slice(0, 6);
    const knownBy = (await sql()`select knower_id from chat_character_links where known_id = ${c.id}`).map(r => chars.find(x => x.id === String(r.knower_id))?.name).filter((n): n is string => !!n).slice(0, 6);
    links.set(c.id, { knows, knownBy });
    const friends = knows;
    const away = await awayFor(userId, c.id);
    return `- ${c.name}: ${c.job || "no job listed"}; hobbies: ${c.hobbies || "—"}; style: ${c.casual_wear || "—"}${c.work_attire ? `; at work: ${c.work_attire}` : ""}; about: ${(c.backstory || c.personality || "").slice(0, 300)}${friends.length ? `; friends (could be in her photo): ${friends.join(", ")}` : ""}${links.get(c.id)?.knownBy.length ? `; people who know her (could comment): ${links.get(c.id)!.knownBy.join(", ")}` : "; nobody she knows comments"}${romanticFor(c, u.adult) ? "; romantic/flirty allowed (PG-13)" : "; keep family-friendly"}${away ? `; ✈️ CURRENTLY OUT OF TOWN at ${away.place} until ${away.until} — post from there` : ""}`;
  }));
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const raw = await writeText("", `You plan one day of posts on Picagram (a social photo app like Instagram) for these characters. ${weekday}. Write ${authors.length} posts, one per character listed, in their own voice: everyday life — at the gym (a confident or sensual gym selfie is fine, PG-13), at home in whatever they're wearing, at work, with their pet if they have one, with a friend or a parent, food, a walk, the beach, a pool or waterpark, a night out, a hobby. At least ${Math.min(authors.length, rand(2, 3))} must be photos ("image"); the rest can be text posts (thoughts, jokes, little updates). A vacation should be RARE (most days none, never more than one): only then add "vacation" with the place and how many days they'll be away (2–7). For photos, "photo" describes exactly what the picture shows (who, where, outfit, pose, light) in 1–2 sentences — the character is in it unless it's clearly a picture of something else; "with" names ONE friend from their list who's in the photo, or "". Captions are short and natural (emojis/hashtags okay). Now and then (not every post) add ONE "friend_comments" entry from someone in "people who know her"; never anyone else — if that list is empty, leave it empty. Everything PG-13 at most: flattering and flirty is fine, never nudity, lingerie or anything sexual; family-friendly characters stay fully clothed. For characters marked "romantic/flirty allowed", now and then (roughly one photo in four) make it a closer, flattering shot with some cleavage showing — a low-cut top, a close-up selfie from a little above, a sports bra at the gym — confident and tasteful, not overt. Reply with JSON only: {"posts":[{"author":"Name","kind":"image"|"text","caption":"...","photo":"...","with":"","vacation":null|{"place":"...","days":3},"friend_comments":[{"from":"Name","text":"..."}]}]}`,
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
  const end = isToday ? Math.max(now + 2 * 3600_000, zonedToUtc(`${day}T22:00`, u.tz) || now) : zonedToUtc(`${day}T21:30`, u.tz) || now;
  const times = posts.map(() => start + Math.random() * (end - start)).sort((a, b) => a - b);
  // Opening the app on a new day: the first post is already up.
  if (isToday && times.length) times[0] = now - rand(5, 50) * 60_000;
  let vacationUsed = false;
  for (let i = 0; i < posts.length; i++) {
    const { c, p } = posts[i];
    const at = new Date(times[i]);
    const caption = scrub(String(p.caption || "")).slice(0, 600), photo = scrub(String(p.photo || "")).slice(0, 600);
    const lk = links.get(c.id) || { knows: [], knownBy: [] };
    const friend = p.with && lk.knows.some(n => n.toLowerCase() === String(p.with).toLowerCase()) ? byName.get(String(p.with).toLowerCase()) : undefined;
    let media: Media | null = null;
    if (p.kind === "image" && photo) {
      media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: photo },
        { characterId: c.id, who: c.name, appearance: c.appearance, refs: await referenceUrls(c), romantic: romanticFor(c, u.adult), mood: mediaMood(c.traits), offer: false, pica: true,
          other: friend && friend.id !== c.id ? { name: friend.name, refs: await referenceUrls(friend), appearance: friend.appearance } : null }).catch(e => { if (!(e instanceof MediaError)) console.error("pica: photo", e instanceof Error ? e.message : e); return null; });
    }
    const big = !!c.big_following;
    const fc = (Array.isArray(p.friend_comments) ? p.friend_comments : []).map(x => ({ c: byName.get(String(x.from || "").toLowerCase()), text: scrub(String(x.text || "")).slice(0, 300) })).filter(x => x.c && x.c.id !== c.id && x.text && lk.knownBy.includes(x.c.name)).slice(0, Math.random() < 0.5 ? 1 : 0);
    const likers = [...new Set([...fc.map(x => x.c!.name), ...lk.knownBy.filter(() => Math.random() < 0.4)])];
    const likerSecs = likers.map(() => rand(60, 6 * 3600));
    const [post] = await sql()`insert into pica_posts (user_id, author_id, kind, caption, photo, media_id, likes_target, liked_by, liker_secs, place, created_at)
      values (${userId}, ${c.id}, ${media ? "image" : "text"}, ${caption || (media ? "" : photo)}, ${media ? photo : ""}, ${media?.id || null}, ${big ? rand(200, 1500) : rand(20, 300)}, ${likers}, ${likerSecs}, ${p.vacation?.place ? scrub(String(p.vacation.place)).slice(0, 80) : ""}, ${at.toISOString()}) returning id`;
    for (const x of fc) await sql()`insert into pica_comments (post_id, user_id, author_id, text, created_at) values (${post.id}, ${userId}, ${x.c!.id}, ${x.text}, ${new Date(times[i] + rand(10, 240) * 60_000).toISOString()})`;
    // Her followers comment: more with a big following (up to 5 comments in all, counting a friend's).
    for (const s of randomComments(`${caption} ${photo}`, media ? "image" : "text", Math.max(0, (big ? rand(3, 5) : rand(1, 3)) - fc.length)))
      await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(times[i] + rand(2, 360) * 60_000).toISOString()})`;
    // ✈️ A (rare) vacation: they're out of town for a few days.
    if (p.vacation?.place && !vacationUsed && !(await awayFor(userId, c.id))) {
      vacationUsed = true;
      const until = addDays(day, Math.max(2, Math.min(7, Number(p.vacation.days) || 3)));
      await sql()`insert into chat_away (user_id, character_id, place, until) values (${userId}, ${c.id}, ${scrub(String(p.vacation.place)).slice(0, 80)}, ${until})
        on conflict (user_id, character_id) do update set place = excluded.place, until = excluded.until`;
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

export async function picaFeed(userId: string, before: string | null, limit = 6): Promise<PicaPost[]> {
  const { name } = await userInfo(userId);
  const rows = await sql()`select p.*, p.created_at::text as at, c.name as author_name, pf.url as portrait, m.id as m_id, m.kind as m_kind, m.status as m_status, mf.url as m_url, mt.url as m_thumb,
      a.place as away_place, a.until::text as away_until,
      ac.id as acc_id, ac.handle as acc_handle, ac.name as acc_name, ac.followed as acc_followed, af.url as acc_avatar,
      exists(select 1 from pica_saved s where s.user_id = p.user_id and s.media_id = p.media_id) as saved,
      (select count(*)::int from pica_comments k where k.post_id = p.id and k.created_at <= now()) as n_comments
    from pica_posts p left join chat_characters c on c.id = p.author_id left join velo_files pf on pf.id = c.portrait_file_id
      left join velo_media m on m.id = p.media_id left join velo_files mf on mf.id = m.file_id left join velo_files mt on mt.id = m.thumb_file_id
      left join chat_away a on a.user_id = p.user_id and a.character_id = p.author_id and a.until >= current_date
      left join pica_accounts ac on ac.id = p.account_id left join velo_media am on am.id = ac.avatar_media_id left join velo_files af on af.id = am.file_id
    where p.user_id = ${userId} and p.created_at <= now() and (${before}::timestamptz is null or p.created_at < ${before}::timestamptz)
    order by p.created_at desc limit ${Math.min(limit, 20)}`;
  const ids = rows.map(r => String(r.id));
  const cm = ids.length ? await commentsFor(userId, ids, name, 3) : new Map<string, PicaComment[]>();
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, caption: String(r.caption || ""), created_at: String(r.at),
    author: r.acc_id && !r.author_id
      ? { id: null, name: String(r.acc_name), portrait: r.acc_avatar ? String(r.acc_avatar) : null, away: null, account: { id: String(r.acc_id), handle: String(r.acc_handle), followed: !!r.acc_followed } }
      : { id: r.author_id ? String(r.author_id) : null, name: r.author_id ? String(r.author_name) : name, portrait: r.portrait ? String(r.portrait) : null, away: r.away_place && r.author_id ? `✈️ ${r.away_place}` : null },
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
  // The preview: the latest few — always including yours and the replies to them (newest at the bottom).
  if (perPost) for (const [k, list] of out) {
    const known = list.filter(x => x.known).slice(-perPost);
    const pad = list.filter(x => !x.known).slice(-Math.max(0, perPost - known.length));
    out.set(k, [...known, ...pad].sort((a, b) => a.created_at.localeCompare(b.created_at)));
  }
  return out;
}
export async function picaComments(userId: string, postId: string): Promise<PicaComment[]> {
  const { name } = await userInfo(userId);
  return (await commentsFor(userId, [postId], name)).get(postId) || [];
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
      const reply = scrub((await writeText(c.brain, `You are ${c.name} (${String(c.personality || "").slice(0, 400)}). On your Picagram post, ${u.name} (someone you know well) just commented. Reply in the comments in your own voice: one short line, maybe an emoji. Output only the reply.`,
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
export async function picaPost(userId: string, caption: string, photo: string, useMyPhotos: boolean): Promise<string> {
  const u = await userInfo(userId);
  const cap = scrub(caption).trim().slice(0, 2000), desc = scrub(photo).replace(/\s+/g, " ").trim().slice(0, 600);
  if (!cap && !desc) throw new MediaError("Write something or describe a photo.");
  let media: Media | null = null;
  if (desc) {
    const refs = useMyPhotos ? (await sql()`select f.url from users u join velo_files f on f.id = u.bio_photo_file_id where u.id = ${userId}
      union all (select f.url from pica_posts p join velo_media m on m.id = p.media_id join velo_files f on f.id = m.file_id where p.user_id = ${userId} and p.author_id is null and m.status = 'done' order by p.created_at desc limit 3)`).map(r => String(r.url)).filter(x => /^https?:\/\//.test(x)).slice(0, 4) : [];
    media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: desc },
      { characterId: null, who: u.name, appearance: u.look, refs, romantic: u.adult, offer: false, other: null, pica: true });
  }
  const now = Date.now();
  const [post] = await sql()`insert into pica_posts (user_id, author_id, kind, caption, photo, media_id, likes_target, seen_at) values (${userId}, null, ${media ? "image" : "text"}, ${cap}, ${media ? desc : ""}, ${media?.id || null}, ${rand(10, 300)}, now()) returning id`;
  for (const s of randomComments(`${cap} ${desc}`, media ? "image" : "text", rand(1, 4)))
    await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(now + rand(3, 240) * 60_000).toISOString()})`;
  // 👥 People they talk to most notice it: some like it, some comment — and they remember.
  const close = await sql()`select c.id, c.name, c.personality, count(*)::int as n from velo_messages m join chat_characters c on c.id = m.character_id
    where m.user_id = ${userId} and m.created_at > now() - interval '30 days' group by c.id, c.name, c.personality order by n desc limit 4`;
  const fans = close.filter(() => Math.random() < 0.75);
  if (fans.length) {
    const raw = await writeText("", `People who know ${u.name} react to ${u.name}'s new Picagram post. For each person, write a short comment in their own voice (or "" if they'd just like it). JSON only: {"comments":[{"from":"Name","text":"..."}]}`,
      `POST: ${cap}${desc ? ` (photo: ${desc})` : ""}\nPEOPLE:\n${fans.map(f => `- ${f.name}: ${String(f.personality || "").slice(0, 200)}`).join("\n")}`, 800).catch(() => "");
    let cs: { from: string; text: string }[] = [];
    try { cs = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).comments || []; } catch { /* likes only */ }
    await sql()`update pica_posts set liked_by = ${fans.map(f => String(f.name))}, liker_secs = ${fans.map(() => rand(10, 900))} where id = ${post.id}`;
    for (const f of fans) {
      const text = scrub(String(cs.find(x => String(x.from).toLowerCase() === String(f.name).toLowerCase())?.text || "")).slice(0, 300);
      if (text) await sql()`insert into pica_comments (post_id, user_id, author_id, text, created_at) values (${post.id}, ${userId}, ${f.id}, ${text}, ${new Date(now + rand(2, 90) * 60_000).toISOString()})`;
      await sql()`insert into velo_memories (user_id, character_id, kind, text) values (${userId}, ${f.id}, 'fact', ${`${u.name} posted on Picagram: "${cap.slice(0, 160)}"${desc ? ` (a photo: ${desc.slice(0, 160)})` : ""}. I liked it${text ? ` and commented "${text.slice(0, 120)}"` : ""}.`.slice(0, 600)})`;
    }
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
export const MAX_FOLLOWING = 70, MAX_ACCOUNTS = 120;
/** One new account a day (up to 120 in all), to discover. */
async function newAccount(userId: string): Promise<Record<string, unknown> | null> {
  const [{ all }] = await sql()`select count(*)::int as all from pica_accounts where user_id = ${userId}`;
  if (all >= MAX_ACCOUNTS) return null;
  const taken = (await sql()`select handle, name from pica_accounts where user_id = ${userId}`).map(r => `${r.handle} (${r.name})`);
  const raw = await writeText("", `Invent ONE woman who posts on Picagram (a social photo app like Instagram): beautiful, aged 21–35, with her own look, background and vibe (fitness, travel, fashion, beach life, cooking, nightlife, yoga, cars, art, music…) — different from the ones already taken. Fictional, never a real person. JSON only: {"name":"First Last","handle":"lowercase_handle","bio":"short bio with emojis","look":"one detailed sentence for an image generator: age, face, hair, eyes, skin, build, usual style","followers":12000}`,
    taken.length ? `Already taken (make her clearly different): ${taken.slice(-40).join(", ")}` : "(none yet)", 600).catch(() => "");
  let a: { name?: string; handle?: string; bio?: string; look?: string; followers?: number } = {};
  try { a = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]); } catch { return null; }
  const handle = String(a.handle || a.name || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 28);
  if (handle.length < 2 || !a.name || taken.some(t => t.startsWith(`${handle} `))) return null;
  const [row] = await sql()`insert into pica_accounts (user_id, handle, name, bio, look, followers) values (${userId}, ${handle}, ${scrub(String(a.name)).slice(0, 60)}, ${scrub(String(a.bio || "")).slice(0, 300)}, ${scrub(String(a.look || "")).slice(0, 600)}, ${Math.max(2000, Math.min(900000, Number(a.followers) || rand(5000, 200000)))}) returning *`;
  return row || null;
}

async function accountPosts(userId: string, day: string, isToday: boolean, u: U): Promise<void> {
  // Accounts they follow (not ones they've befriended — those are characters now), plus today's one new face.
  const followed = shuffle(await sql()`select * from pica_accounts where user_id = ${userId} and followed and character_id is null`).slice(0, rand(1, 2));
  const fresh = await newAccount(userId);
  const who = [...followed, ...(fresh ? [fresh] : [])];
  if (!who.length) return;
  const raw = await writeText("", `Write one Picagram post for each of these women: a photo of her in her everyday life or her niche — gym, beach, pool, brunch, travel, a night out, at home, an outfit — with a short caption (emojis/hashtags okay). ${u.adult ? "Flattering, flirty and confident is fine (PG-13): swimwear at the beach or pool is okay, and now and then (about one post in four) a closer, flattering shot with some cleavage showing — a low-cut top, a close-up selfie from a little above — confident and tasteful, not overt; never nudity, lingerie or anything sexual." : "Keep it family-friendly, fully clothed."} "photo" describes exactly what the picture shows (where, outfit, pose, light) in 1–2 sentences. JSON only: {"posts":[{"handle":"...","caption":"...","photo":"..."}]}`,
    who.map(a => `- @${a.handle} (${a.name}): ${a.bio} — looks: ${a.look}`).join("\n"), 1500).catch(() => "");
  let plan: { handle?: string; caption?: string; photo?: string }[] = [];
  try { plan = JSON.parse((raw.match(/\{[\s\S]*\}/) || ["{}"])[0]).posts || []; } catch { /* skip today */ }
  const now = Date.now();
  const start = isToday ? now : zonedToUtc(`${day}T09:00`, u.tz) || now, end = isToday ? Math.max(now + 2 * 3600_000, zonedToUtc(`${day}T22:00`, u.tz) || now) : zonedToUtc(`${day}T21:30`, u.tz) || now;
  for (const a of who) {
    const p = plan.find(x => String(x.handle || "").replace(/^@/, "").toLowerCase() === String(a.handle)) || null;
    const photo = scrub(String(p?.photo || `${a.name} candid lifestyle photo, natural light`)).slice(0, 600), caption = scrub(String(p?.caption || "✨")).slice(0, 600);
    const [av] = a.avatar_media_id ? await sql()`select f.url from velo_media m join velo_files f on f.id = m.file_id where m.id = ${a.avatar_media_id} and m.status = 'done'` : [];
    const media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: photo },
      { characterId: null, who: String(a.name), appearance: String(a.look), refs: av ? [String(av.url)] : [], romantic: u.adult, offer: false, other: null, pica: true }).catch(() => null);
    if (!media) continue;
    if (!a.avatar_media_id) await sql()`update pica_accounts set avatar_media_id = ${media.id} where id = ${a.id}`;
    const at = isToday && a === who[0] ? now - rand(5, 40) * 60_000 : start + Math.random() * (end - start);
    const likes = Math.max(150, Math.min(25000, Math.round(Number(a.followers) * (0.005 + Math.random() * 0.03))));
    const [post] = await sql()`insert into pica_posts (user_id, account_id, kind, caption, photo, media_id, likes_target, created_at) values (${userId}, ${a.id}, 'image', ${caption}, ${photo}, ${media.id}, ${likes}, ${new Date(at).toISOString()}) returning id`;
    for (const s of randomComments(`${caption} ${photo}`, "image", rand(3, 5)))
      await sql()`insert into pica_comments (post_id, user_id, name, text, created_at) values (${post.id}, ${userId}, ${s.name}, ${s.text}, ${new Date(at + rand(2, 300) * 60_000).toISOString()})`;
  }
}

export class PicaLimit extends Error {}
export async function picaFollow(userId: string, accountId: string, on: boolean): Promise<boolean> {
  if (on) {
    const [{ n }] = await sql()`select count(*)::int as n from pica_accounts where user_id = ${userId} and followed and id <> ${accountId}`;
    if (n >= MAX_FOLLOWING) throw new PicaLimit(`You follow ${MAX_FOLLOWING} accounts — unfollow some in 👥 Following to add new ones.`);
  }
  const r = await sql()`update pica_accounts set followed = ${on}, followers = followers + ${on ? 1 : -1} where id = ${accountId} and user_id = ${userId} returning id`;
  return r.length > 0;
}

/** 👤 Someone's profile: who she is and her photos. */
export async function picaProfile(userId: string, accountId: string) {
  const [a] = await sql()`select a.id, a.handle, a.name, a.bio, a.followers, a.followed, a.character_id, f.url as avatar from pica_accounts a left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id where a.id = ${accountId} and a.user_id = ${userId}`;
  if (!a) return null;
  const posts = await sql()`select p.id, p.caption, m.id as media_id, f.url, t.url as thumb, exists(select 1 from pica_saved s where s.user_id = p.user_id and s.media_id = m.id) as saved
    from pica_posts p join velo_media m on m.id = p.media_id join velo_files f on f.id = m.file_id left join velo_files t on t.id = m.thumb_file_id
    where p.user_id = ${userId} and p.account_id = ${accountId} and p.created_at <= now() and m.status = 'done' order by p.created_at desc limit 60`;
  return { account: { id: String(a.id), handle: String(a.handle), name: String(a.name), bio: String(a.bio), followers: Number(a.followers), followed: !!a.followed, avatar: a.avatar ? String(a.avatar) : null, character_id: a.character_id ? String(a.character_id) : null },
    photos: posts.map(r => ({ media_id: String(r.media_id), url: String(r.url), thumb: r.thumb ? String(r.thumb) : null, caption: String(r.caption || ""), saved: !!r.saved })) };
}

/** 🔖 Their own Picagram gallery: pictures they saved. */
export async function picaSave(userId: string, mediaId: string, on: boolean): Promise<boolean> {
  const [m] = await sql()`select 1 from pica_posts where user_id = ${userId} and media_id = ${mediaId} limit 1`;
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

/** 👥 Who they follow (up to 70), to unfollow some. */
export async function picaFollowing(userId: string) {
  const rows = await sql()`select a.id, a.handle, a.name, a.character_id, f.url as avatar from pica_accounts a left join velo_media m on m.id = a.avatar_media_id left join velo_files f on f.id = m.file_id
    where a.user_id = ${userId} and a.followed order by a.name`;
  return rows.map(r => ({ id: String(r.id), handle: String(r.handle), name: String(r.name), avatar: r.avatar ? String(r.avatar) : null, friend: !!r.character_id }));
}

/** 🤝 Befriend her: she becomes a character (filled in for them; her photos are her headshot and references). */
export async function picaBefriend(userId: string, accountId: string): Promise<string> {
  const [a] = await sql()`select * from pica_accounts where id = ${accountId} and user_id = ${userId}`;
  if (!a) throw new PicaLimit("That account wasn't found.");
  if (a.character_id) { const [c] = await sql()`select id from chat_characters where id = ${a.character_id}`; if (c) return String(c.id); }
  const u = await userInfo(userId);
  const photos = (await sql()`select m.id, m.file_id from pica_posts p join velo_media m on m.id = p.media_id where p.user_id = ${userId} and p.account_id = ${accountId} and m.status = 'done' order by p.created_at desc limit 4`);
  const [av] = a.avatar_media_id ? await sql()`select file_id from velo_media where id = ${a.avatar_media_id} and status = 'done'` : [];
  const names = (await sql()`select name from chat_characters where owner_id is null or owner_id = ${userId}`).map(r => String(r.name));
  const first = String(a.name).split(/\s+/)[0];
  const d = await makeCharacter({ name: names.includes(first) ? String(a.name) : first, vibe: `She posts on Picagram as @${a.handle}: "${a.bio}". Looks: ${a.look}. You two just became friends after you followed her on Picagram.`, romantic: u.adult, male: false, avoidNames: [] });
  const [c] = await sql()`insert into chat_characters (created_by, owner_id, intro_status, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, birthday, time_zone, work_attire, work_days, work_start, work_end, part_time, portrait_file_id, reference_ids)
    values (${userId}, ${userId}, 'accepted', ${d.name}, ${d.personality}, ${d.backstory}, ${scrub(`Someone you met on Picagram (@${a.handle}) — you followed her and became friends`)}, ${scrub(String(a.look || d.appearance)).slice(0, 600)}, ${d.job}, ${d.casual_wear}, ${d.hobbies}, ${d.voice}, ${d.voice_name}, ${d.voice_kind}, ${d.romantic}, ${d.romance_arc}, ${JSON.stringify(d.traits)}::jsonb, ${d.birthday}, '',
      ${d.work_attire}, ${d.work_days}::int[], ${d.work_start}, ${d.work_end}, ${d.part_time}, ${av?.file_id || photos[0]?.file_id || null}, ${photos.map(p => String(p.id))}::uuid[]) returning id`;
  // Her pictures are hers now (her gallery and references), and she keeps posting as a character.
  if (photos.length) await sql()`update velo_media set character_id = ${c.id} where id = any(${photos.map(p => String(p.id))}::uuid[]) and user_id = ${userId}`;
  await sql()`update pica_accounts set character_id = ${c.id}, followed = true where id = ${accountId}`;
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
