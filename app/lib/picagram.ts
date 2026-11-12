// 📸 Picagram: a pretend Instagram for each person's world. Every day 3–5 characters post (2–3 photos,
// the rest text), strangers and friends like and comment, and the person can post too. Posts keep
// coming even on days they don't look. Characters know about it: their own posts (and whether the
// person saw, liked or commented), the person's posts, and when they're out of town on vacation.
import { sql } from "./db";
import { writeText } from "./llm";
import { scrub } from "./secrets";
import { listCharacters, referenceUrls, type Character } from "./characters";
import { friendsOf } from "./friends";
import { startMedia, MediaError, type Media } from "./media";
import { allowsSuggestive, mediaMood } from "./traits";
import { isValidTimeZone, localDate, zonedParts, zonedToUtc } from "./localTime";
import { randomComments } from "./picaComments";

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
export async function ensurePicaDays(userId: string, backfill = 2): Promise<number> {
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

type Planned = { author: string; kind: "image" | "text"; caption: string; photo: string; with: string; vacation: { place: string; days: number } | null; friend_comments: { from: string; text: string }[] };

async function generateDay(userId: string, day: string, isToday: boolean): Promise<boolean> {
  const chars = (await listCharacters(userId)).filter(c => !c.owner_id || c.owner_id === userId);
  if (!chars.length) return false;
  const u = await userInfo(userId);
  const authors = shuffle(chars).slice(0, Math.min(rand(3, 5), chars.length));
  const info = await Promise.all(authors.map(async c => {
    const friends = (await friendsOf(c, userId).catch(() => [])).map(f => f.name).filter(n => chars.some(x => x.name === n)).slice(0, 6);
    const away = await awayFor(userId, c.id);
    return `- ${c.name}: ${c.job || "no job listed"}; hobbies: ${c.hobbies || "—"}; style: ${c.casual_wear || "—"}${c.work_attire ? `; at work: ${c.work_attire}` : ""}; about: ${(c.backstory || c.personality || "").slice(0, 300)}${friends.length ? `; friends on Picagram: ${friends.join(", ")}` : ""}${romanticFor(c, u.adult) ? "; romantic/flirty allowed (PG-13)" : "; keep family-friendly"}${away ? `; ✈️ CURRENTLY OUT OF TOWN at ${away.place} until ${away.until} — post from there` : ""}`;
  }));
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const raw = await writeText("", `You plan one day of posts on Picagram (a social photo app like Instagram) for these characters. ${weekday}. Write ${authors.length} posts, one per character listed, in their own voice: everyday life — at the gym (a confident or sensual gym selfie is fine, PG-13), at home in whatever they're wearing, at work, with their pet if they have one, with a friend or a parent, food, a walk, the beach, a pool or waterpark, a night out, a hobby. At least ${Math.min(authors.length, rand(2, 3))} must be photos ("image"); the rest can be text posts (thoughts, jokes, little updates). A vacation should be RARE (most days none, never more than one): only then add "vacation" with the place and how many days they'll be away (2–7). For photos, "photo" describes exactly what the picture shows (who, where, outfit, pose, light) in 1–2 sentences — the character is in it unless it's clearly a picture of something else; "with" names ONE friend from their list who's in the photo, or "". Captions are short and natural (emojis/hashtags okay). Add 0–2 "friend_comments" from people in their friends list. Everything PG-13 at most: flattering and flirty is fine, never nudity, lingerie or anything sexual; family-friendly characters stay fully clothed. Reply with JSON only: {"posts":[{"author":"Name","kind":"image"|"text","caption":"...","photo":"...","with":"","vacation":null|{"place":"...","days":3},"friend_comments":[{"from":"Name","text":"..."}]}]}`,
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
    const friend = p.with ? byName.get(String(p.with).toLowerCase()) : undefined;
    let media: Media | null = null;
    if (p.kind === "image" && photo) {
      media = await startMedia(userId, { kind: "image", with_me: true, they_asked: true, description: photo },
        { characterId: c.id, who: c.name, appearance: c.appearance, refs: await referenceUrls(c), romantic: romanticFor(c, u.adult), mood: mediaMood(c.traits), offer: false, pica: true,
          other: friend && friend.id !== c.id ? { name: friend.name, refs: await referenceUrls(friend), appearance: friend.appearance } : null }).catch(e => { if (!(e instanceof MediaError)) console.error("pica: photo", e instanceof Error ? e.message : e); return null; });
    }
    const big = !!c.big_following;
    const fc = (Array.isArray(p.friend_comments) ? p.friend_comments : []).map(x => ({ c: byName.get(String(x.from || "").toLowerCase()), text: scrub(String(x.text || "")).slice(0, 300) })).filter(x => x.c && x.c.id !== c.id && x.text);
    const likers = [...new Set([...fc.map(x => x.c!.name), ...(Math.random() < 0.6 && friend ? [friend.name] : [])])];
    const [post] = await sql()`insert into pica_posts (user_id, author_id, kind, caption, photo, media_id, likes_target, liked_by, place, created_at)
      values (${userId}, ${c.id}, ${media ? "image" : "text"}, ${caption || (media ? "" : photo)}, ${media ? photo : ""}, ${media?.id || null}, ${big ? rand(200, 1500) : rand(20, 300)}, ${likers}, ${p.vacation?.place ? scrub(String(p.vacation.place)).slice(0, 80) : ""}, ${at.toISOString()}) returning id`;
    for (const x of fc) await sql()`insert into pica_comments (post_id, user_id, author_id, text, created_at) values (${post.id}, ${userId}, ${x.c!.id}, ${x.text}, ${new Date(times[i] + rand(10, 240) * 60_000).toISOString()})`;
    for (const s of randomComments(`${caption} ${photo}`, media ? "image" : "text", rand(2, 5)))
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
const ramp = (target: number, at: string) => Math.round(target * Math.min(1, Math.sqrt(Math.max(0, Date.now() - Date.parse(at)) / (10 * 3600_000))));
export type PicaPost = { id: string; author: { id: string | null; name: string; portrait: string | null; away: string | null }; kind: "image" | "text"; caption: string; media: Media | null; likes: number; liked: boolean; liked_by: string[]; comments: number; preview: PicaComment[]; created_at: string };
export type PicaComment = { id: string; who: string; me: boolean; known: boolean; text: string; created_at: string };

export async function picaFeed(userId: string, before: string | null, limit = 6): Promise<PicaPost[]> {
  const { name } = await userInfo(userId);
  const rows = await sql()`select p.*, p.created_at::text as at, c.name as author_name, pf.url as portrait, m.id as m_id, m.kind as m_kind, m.status as m_status, mf.url as m_url, mt.url as m_thumb,
      a.place as away_place, a.until::text as away_until,
      (select count(*)::int from pica_comments k where k.post_id = p.id and k.created_at <= now()) as n_comments
    from pica_posts p left join chat_characters c on c.id = p.author_id left join velo_files pf on pf.id = c.portrait_file_id
      left join velo_media m on m.id = p.media_id left join velo_files mf on mf.id = m.file_id left join velo_files mt on mt.id = m.thumb_file_id
      left join chat_away a on a.user_id = p.user_id and a.character_id = p.author_id and a.until >= current_date
    where p.user_id = ${userId} and p.created_at <= now() and (${before}::timestamptz is null or p.created_at < ${before}::timestamptz)
    order by p.created_at desc limit ${Math.min(limit, 20)}`;
  const ids = rows.map(r => String(r.id));
  const cm = ids.length ? await commentsFor(userId, ids, name, 2) : new Map<string, PicaComment[]>();
  return rows.map(r => ({
    id: String(r.id), kind: r.kind, caption: String(r.caption || ""), created_at: String(r.at),
    author: { id: r.author_id ? String(r.author_id) : null, name: r.author_id ? String(r.author_name) : name, portrait: r.portrait ? String(r.portrait) : null, away: r.away_place && r.author_id ? `✈️ ${r.away_place}` : null },
    media: r.m_id ? ({ id: String(r.m_id), kind: r.m_kind, status: r.m_status, url: r.m_status === "done" ? r.m_url : null, thumb: r.m_thumb || null } as Media) : null,
    likes: ramp(Number(r.likes_target), String(r.at)) + (r.liked ? 1 : 0), liked: !!r.liked, liked_by: (r.liked_by || []) as string[],
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
  if (perPost) for (const [k, list] of out) out.set(k, [...list.filter(x => x.known), ...list.filter(x => !x.known).reverse()].slice(0, perPost));
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
    await sql()`update pica_posts set liked_by = ${fans.map(f => String(f.name))} where id = ${post.id}`;
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
