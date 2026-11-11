import { NextRequest, NextResponse } from "next/server";
import { duePlans, setPlanStatus } from "../../lib/plans";
import { readyIntros, acceptIntro, declineIntro, IntroError } from "../../lib/intros";
import { peekAt, draftPeek } from "../../lib/peek";
import { cleanTags } from "../../lib/text";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { isValidTimeZone, localDate } from "../../lib/localTime";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { toE164, showPhone, twilioReady, veloNumber } from "../../lib/twilio";
import { PHONE_MSG } from "../../lib/contact";
import { scrub } from "../../lib/secrets";
import { BIO_SECTIONS, BIO_MAX } from "../../lib/bioSections";
import { availableModels, CHAT_MODELS, MODEL_INFO, type ChatModel } from "../../lib/models";
import { PERSONALITIES } from "../../lib/persona";
import { deleteFile, ownFile } from "../../lib/files";
import { getCharacterFor, trustFor, activeScene } from "../../lib/characters";
import { US_STATES } from "../../lib/states";
import { acceptMedia, declineMedia, mediaNote, checkMedia, sweepMedia, getMedia, listGallery, deleteMedia, VIDEO_MODELS, DEFAULT_VIDEO_MODEL, mediaReady, MediaError, startMedia } from "../../lib/media";

// 📦 Everything the app reads and changes, for the signed-in person only.
// POST { action, ...args } → { ... }. Every query is scoped to their user_id.
import { REACTIONS as REACTION_LIST } from "../../lib/reactions";
import { sceneTime, HHMM } from "../../lib/sceneClock";
const REACTIONS: string[] = [...REACTION_LIST];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const db = sql(), me = c.userId;
    const id = String(b.id || "");
    const needId = () => UUID.test(id);

    switch (String(b.action || "")) {
      case "profile.get": {
        const [u] = await db`select name, look, time_zone, plan, phone, phone_verified_at, chat_model, personality, adult_confirmed_at, video_model, reply_length, checkins, bio, birthday::text, age, home_state, (select url from velo_files where id = users.bio_photo_file_id) as bio_photo, (select thumb_url from velo_files where id = users.bio_photo_file_id) as bio_thumb, bio_photo_note, bio_more from users where id = ${me}`;
        const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${me} and kind = 'call' and character_id is null`;
        const [face] = await db`select url from velo_files where user_id = ${me} and kind = 'face' order by created_at desc limit 1`;
        return NextResponse.json({
          name: u?.name || "", look: u?.look === "custom" && !face ? "default" : u?.look || "default", customFace: face ? String(face.url) : "",
          timeZone: u?.time_zone || null, hadCall: n > 0,
          plan: u?.plan || "free", proForSale: !!process.env.STRIPE_PRICE_PRO && twilioReady(),
          phone: u?.phone ? showPhone(String(u.phone)) : "", phoneVerified: !!u?.phone_verified_at, veloNumber: veloNumber(),
          chatModel: availableModels().includes(u?.chat_model) ? u?.chat_model : "claude",
          models: availableModels().map(id => ({ id, ...MODEL_INFO[id] })),
          bio: { text: u?.bio || "", birthday: u?.birthday || "", age: u?.age || null, state: u?.home_state || "", photo: u?.bio_thumb || u?.bio_photo || "", photoNote: u?.bio_photo_note || "", more: u?.bio_more && typeof u.bio_more === "object" ? u.bio_more : {} },
          checkins: u?.checkins || "sometimes",
          videoModel: VIDEO_MODELS.some(m => m.id === u?.video_model) ? u?.video_model : DEFAULT_VIDEO_MODEL,
          videoModels: VIDEO_MODELS.map(m => ({ id: m.id, label: m.label })),
          replyLength: ["short", "normal", "long"].includes(u?.reply_length) ? u?.reply_length : "normal",
          // Anything unknown (or romantic without the 18+ confirmation) shows as Friend.
          personality: !PERSONALITIES.includes(u?.personality) || (u?.personality === "romantic" && !u?.adult_confirmed_at) ? "friend" : u?.personality,
          adultConfirmed: !!u?.adult_confirmed_at,
        });
      }
      case "profile.update": {
        if (typeof b.name === "string") await db`update users set name = ${clean(b.name, 80) || null}, updated_at = now() where id = ${me}`;
        if (typeof b.look === "string" && VELO_LOOKS.some(l => l.id === b.look)) await db`update users set look = ${b.look}, updated_at = now() where id = ${me}`;
        // "custom" = the face they uploaded (only if there is one).
        if (b.look === "custom") await db`update users set look = 'custom', updated_at = now() where id = ${me} and exists (select 1 from velo_files where user_id = ${me} and kind = 'face')`;
        if (isValidTimeZone(b.timeZone)) await db`update users set time_zone = ${b.timeZone} where id = ${me}`;
        // Romantic is for adults: picking it needs the 18+ confirmation (sent with it, or given before).
        if (b.adultConfirmed === true) await db`update users set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = ${me}`;
        if (PERSONALITIES.includes(b.personality)) {
          const [a] = await db`select adult_confirmed_at from users where id = ${me}`;
          if (b.personality === "romantic" && !a?.adult_confirmed_at) return bad("Romantic mode is for adults — confirm you're 18 or older.");
          await db`update users set personality = ${b.personality}, updated_at = now() where id = ${me}`;
        }
        if (CHAT_MODELS.includes(b.chatModel) && availableModels().includes(b.chatModel as ChatModel)) await db`update users set chat_model = ${b.chatModel}, updated_at = now() where id = ${me}`;
        // 👤 About you (all optional; empty clears it).
        if (b.bio && typeof b.bio === "object") {
          const x = b.bio as Record<string, unknown>;
          const text = scrub(String(x.text ?? "").trim().slice(0, 1000)) || null;
          const bday = typeof x.birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.birthday) && !Number.isNaN(Date.parse(x.birthday)) && x.birthday > "1900-01-01" && Date.parse(x.birthday) < Date.now() ? x.birthday : null;
          const age = bday ? null : Number.isInteger(Number(x.age)) && Number(x.age) >= 13 && Number(x.age) <= 120 ? Number(x.age) : null;
          const st = US_STATES.includes(x.state as (typeof US_STATES)[number]) ? String(x.state) : null;
          // 👤 The extra sections: only known ones, trimmed, secrets hidden.
          const raw = x.more && typeof x.more === "object" ? (x.more as Record<string, unknown>) : {};
          const more: Record<string, string> = {};
          for (const sct of BIO_SECTIONS) { const v = scrub(String(raw[sct.key] ?? "").replace(/[ \t]+/g, " ").trim().slice(0, BIO_MAX)); if (v) more[sct.key] = v; }
          await db`update users set bio = ${text}, birthday = ${bday}, age = ${age}, home_state = ${st}, bio_more = ${JSON.stringify(more)}::jsonb, updated_at = now() where id = ${me}`;
        }
        if (["off", "sometimes", "often"].includes(b.checkins)) await db`update users set checkins = ${b.checkins}, updated_at = now() where id = ${me}`;
        if (VIDEO_MODELS.some(m => m.id === b.videoModel)) await db`update users set video_model = ${b.videoModel}, updated_at = now() where id = ${me}`;
        if (["short", "normal", "long"].includes(b.replyLength)) await db`update users set reply_length = ${b.replyLength}, updated_at = now() where id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      case "messages.list": {
        // Velo's chat (no characterId) or one character's chat.
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        const rows = await db`select m.id, m.role, m.content, m.peek, m.reaction, m.their_reaction, f.id as file_id, f.url as file_url, f.thumb_url as file_thumb, f.name as file_name, f.content_type as file_type,
            md.id as media_id, md.kind as media_kind, md.status as media_status, md.reaction as media_reaction, md.description as media_description, md.kept as media_kept, mf.url as media_url, coalesce(mt.url, md.poster_url) as media_thumb
          from velo_messages m left join velo_files f on f.id = m.file_id and f.user_id = m.user_id
          left join velo_media md on md.id = m.media_id and md.user_id = m.user_id
          left join velo_files mf on mf.id = md.file_id
          left join velo_files mt on mt.id = md.thumb_file_id
          where m.user_id = ${me} and m.character_id is not distinct from ${ch?.id || null} order by m.created_at desc, m.id desc limit 60`;
        return NextResponse.json({ messages: rows.reverse().filter(r => r.role === "user" || r.file_id || r.media_id || cleanTags(String(r.content))).map(r => ({ id: r.id, role: r.role, ...(r.peek ? { peek: true } : {}), content: r.role === "assistant" ? cleanTags(String(r.content)) : r.content, reaction: r.reaction || null, theirReaction: r.their_reaction || null,
          ...(r.file_id ? { file: { id: r.file_id, url: r.file_url, thumb: r.file_thumb || null, name: r.file_name, type: r.file_type } } : {}),
          ...(r.media_id ? { media: { id: r.media_id, kind: r.media_kind, status: r.media_status, url: r.media_status === "done" ? r.media_url : null, thumb: r.media_thumb || null, reaction: r.media_reaction || null, description: r.media_description || null, kept: !!r.media_kept } } : {}) })) });
      }
      case "messages.add": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        const list = (Array.isArray(b.messages) ? b.messages : []).slice(0, 4)
          // ⏰ / 👍 markers (her brain down / back): shown to them, never to her (stored like a peek).
          .map((m: { role?: string; content?: unknown; fileId?: unknown; mediaId?: unknown; marker?: unknown }) => m.marker === "wait" || m.marker === "back"
            ? { role: "assistant", content: m.marker === "wait" ? "⏰" : "👍", fileId: "", mediaId: "", marker: true }
            : { role: m.role === "assistant" ? "assistant" : "user", content: scrub(String(m.content || "").slice(0, 8000)), fileId: String(m.fileId || ""), mediaId: String(m.mediaId || ""), marker: false })
          .filter((m: { content: string; fileId: string; mediaId: string }) => m.content || m.fileId || m.mediaId);
        // A millisecond apart so they always sort in the order sent.
        const at = Date.now() - list.length;
        const ids: string[] = [];
        // 🎬 Messages during a scene are part of it.
        const sceneId = ch ? (await activeScene(me, ch.id))?.id || null : null;
        for (const [i, m] of list.entries()) {
          // Only their own file can be attached.
          const f = m.fileId && m.role === "user" ? await ownFile(me, m.fileId) : null;
          // A photo/video sent in this same chat (theirs, and from this Velo/character).
          const md = m.mediaId && m.role === "assistant" ? await getMedia(me, m.mediaId) : null;
          const mediaId = md && md.character_id === (ch?.id || null) ? md.id : null;
          const [row] = await db`insert into velo_messages (user_id, role, content, file_id, media_id, character_id, scene_id, created_at, peek) values (${me}, ${m.role}, ${m.content || (mediaId ? "(sent a photo)" : "📎")}, ${f?.id || null}, ${mediaId}, ${ch?.id || null}, ${sceneId}, ${new Date(at + i).toISOString()}, ${!!m.marker}) returning id`;
          ids.push(String(row.id));
        }
        return NextResponse.json({ ok: true, ids });
      }
      // 😮 React to one of Velo's / a character's messages (null takes it back). They see it from then on.
      case "messages.react": {
        const reaction = REACTIONS.includes(b.reaction) ? String(b.reaction) : null;
        if (!needId()) return bad("Unknown message.");
        const [m] = await db`update velo_messages set reaction = ${reaction} where id = ${id} and user_id = ${me} and role = 'assistant' returning id`;
        return m ? NextResponse.json({ ok: true }) : bad("Unknown message.");
      }
      case "messages.clear":
        // Velo's chat only; each character's chat goes when the character is deleted.
        await db`delete from velo_messages where user_id = ${me} and character_id is null`;
        return NextResponse.json({ ok: true });

      // 🎨 Photos/videos: check one (saves it once ready), or sweep all unfinished ones.
      // ❤️ React to a photo/video (null removes it). The chat note changes too, so Velo/the character sees it.
      case "media.react": {
        const reaction = REACTIONS.includes(b.reaction) ? String(b.reaction) : null;
        if (!needId()) return bad("Unknown media.");
        const [m] = await db`update velo_media set reaction = ${reaction} where id = ${id} and user_id = ${me} and status = 'done' returning kind, description, subject`;
        if (!m) return bad("Unknown media.");
        const note = mediaNote(m.kind, "done", m.description, reaction, m.subject);
        await db`update velo_messages set content = ${note} where media_id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true, note });
      }
      case "bio.photoRemove": {
        await db`update users set bio_photo_file_id = null, bio_photo_note = null where id = ${me}`;
        const old = await db`select id from velo_files where user_id = ${me} and kind = 'bio'`;
        for (const o of old) await deleteFile(me, String(o.id));
        return NextResponse.json({ ok: true });
      }
      // 📸 An offered photo/video: yes (make it now) or no thanks.
      case "media.accept": {
        const m = needId() ? await acceptMedia(me, id) : null;
        return m ? NextResponse.json({ media: m }) : bad("That offer isn't open anymore.");
      }
      case "media.decline": {
        const m = needId() ? await declineMedia(me, id) : null;
        return m ? NextResponse.json({ media: m }) : bad("That offer isn't open anymore.");
      }
      // 🎬 Scenes with a character: play one out (start → chat → end), or say one already happened.
      case "scene.active":
      case "scene.start":
      case "scene.past":
      case "scene.end": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        const action = String(b.action);
        const cur = await activeScene(me, ch.id);
        if (action === "scene.active") return NextResponse.json({ scene: cur });
        const day = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const marker = async (content: string, sceneId: string | null) => {
          const [row] = await db`insert into velo_messages (user_id, role, content, character_id, scene_id) values (${me}, 'user', ${content}, ${ch.id}, ${sceneId}) returning id`;
          return { id: String(row.id), role: "user", content };
        };
        if (action === "scene.end") {
          if (!cur) return bad("There's no scene going on.");
          await db`update chat_scenes set status = 'ended', ended_at = now() where id = ${cur.id}`;
          // A lasting memory for her (the play-by-play summary comes from the chat itself).
          await db`insert into velo_memories (user_id, character_id, kind, text) values (${me}, ${ch.id}, 'fact', ${`We did this together (${day}): ${cur.title}`.slice(0, 300)})`;
          return NextResponse.json({ ok: true, marker: await marker(`🎬 Scene ended: ${cur.title}`, null) });
        }
        const title = scrub(clean(b.title, 120)), details = scrub(String(b.details ?? "").replace(/\s+/g, " ").trim().slice(0, 1000));
        if (!title) return bad("Say what the scene is (e.g. a dinner date at Luigi's).");
        if (cur) await db`update chat_scenes set status = 'ended', ended_at = now() where id = ${cur.id}`;
        // 🕒 Its clock: real time ("now"), or its own scheduled time ("set"). A plan's time is kept, so she knows if it got pushed back.
        const [plan] = b.planId ? await db`select at_time from chat_plans where id = ${String(b.planId)} and user_id = ${me}` : [];
        const plannedTime = HHMM.test(String(plan?.at_time || "")) ? String(plan.at_time) : "";
        const setTime = b.clock === "set" && HHMM.test(String(b.time || "")) ? String(b.time) : "";
        const clock = setTime ? "set" : "now";
        const [tzRow] = await db`select time_zone from users where id = ${me}`;
        const nowAt = sceneTime({ clock: "now" }, isValidTimeZone(tzRow?.time_zone) ? tzRow.time_zone : "America/Chicago").hhmm;
        const pushed = clock === "now" && !!plannedTime && Math.abs(Number(nowAt.slice(0, 2)) * 60 + Number(nowAt.slice(3)) - (Number(plannedTime.slice(0, 2)) * 60 + Number(plannedTime.slice(3)))) >= 60;
        // Started from a plan's "today" card: that plan is done.
        if (b.planId) await setPlanStatus(me, String(b.planId), "done");
        if (action === "scene.start") {
          const [s] = await db`insert into chat_scenes (user_id, character_id, kind, title, details, clock, set_time, planned_time, pushed) values (${me}, ${ch.id}, 'live', ${title}, ${details}, ${clock}, ${setTime}, ${plannedTime}, ${pushed}) returning id, kind, title, details, status, started_at::text, clock, set_time, planned_time`;
          return NextResponse.json({ scene: s, marker: await marker(`🎬 Scene: ${title}${details ? ` — ${details}` : ""}`, String(s.id)) });
        }
        const [s] = await db`insert into chat_scenes (user_id, character_id, kind, title, details, status, ended_at) values (${me}, ${ch.id}, 'past', ${title}, ${details}, 'ended', now()) returning id`;
        await db`insert into velo_memories (user_id, character_id, kind, text) values (${me}, ${ch.id}, 'fact', ${`We did this together (${day}): ${title}${details ? ` — ${details}` : ""}`.slice(0, 300)})`;
        return NextResponse.json({ ok: true, marker: await marker(`🎬 Something we did together: ${title}${details ? ` — ${details}` : ""}`, String(s.id)) });
      }

      // 👋 Introductions from this character whose headshot is ready; meet her, or not now.
      case "intros.ready": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        return NextResponse.json({ intros: await readyIntros(me, ch.id) });
      }
      case "intros.accept":
        try { return NextResponse.json({ character: await acceptIntro(me, String(b.id || "")) }); }
        catch (e) { if (e instanceof IntroError) return bad(e.message); throw e; }
      case "intros.decline":
        await declineIntro(me, String(b.id || ""));
        return NextResponse.json({ ok: true });

      // 📅 Plans whose day has come, for a character's chat ("set the scene" card); skip one.
      case "plans.due": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        const [u] = await db`select time_zone from users where id = ${me}`;
        const today = /^\d{4}-\d{2}-\d{2}$/.test(String(b.today || "")) ? String(b.today) : localDate(Date.now(), isValidTimeZone(u?.time_zone) ? u.time_zone : "America/Chicago");
        return NextResponse.json({ plans: await duePlans(me, ch.id, today) });
      }
      case "plans.skip": {
        if (!(await setPlanStatus(me, String(b.planId || ""), "skipped"))) return bad("That plan isn't open anymore.");
        return NextResponse.json({ ok: true });
      }
      // 👀 A peek at the scene going on with a character: a picture of the moment, which she never knows about.
      case "scene.peek.draft":
      case "scene.peek": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        const cur = await activeScene(me, ch.id);
        if (!cur) return bad("Peeks work during a scene you're playing out together.");
        if (!mediaReady()) return bad("Photos aren't set up yet.");
        // Each draft is an AI call: a per-person limit so one account can't run up the bill.
        if (!allow(`peek:${me}`, [{ ms: 60_000, max: 10 }, { ms: 86_400_000, max: 300 }])) return NextResponse.json({ error: "That's a lot of peeks — try again in a bit." }, { status: 429 });
        const [u] = await db`select adult_confirmed_at from users where id = ${me}`;
        try {
          if (b.action === "scene.peek.draft") return NextResponse.json({ description: await draftPeek(me, ch, cur, !!u?.adult_confirmed_at) });
          const description = String(b.description || "").trim();
          if (description.length < 10) return bad("Describe the moment in a few words first.");
          const p = await peekAt(me, ch, cur, !!u?.adult_confirmed_at, description);
          if (p.media.status === "failed") return bad("The picture service wouldn't make that one — try changing the description.");
          return NextResponse.json(p);
        } catch (e) {
          if (e instanceof MediaError && /can't be sent/.test(e.message)) return bad(/PG-13/.test(e.message) ? "That's past PG-13 — it can be flirty, but no nudity, lingerie or anything explicit. Try changing the description." : "Keep it family-friendly (fully clothed, nothing suggestive) — try changing the description.");
          return bad(e instanceof MediaError ? "Couldn't peek right now — try again in a moment." : "Couldn't peek right now.");
        }
      }
      // 🔴 Unread: messages from Velo / each character since they last looked at that chat.
      
      case "media.icu": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        if (!mediaReady()) return bad("Photos aren't set up yet.");
        if (!allow(`icu:${me}`, [{ ms: 60_000, max: 6 }, { ms: 86_400_000, max: 80 }])) return NextResponse.json({ error: "That's a lot of photos — try again in a bit." }, { status: 429 });
        const [u] = await db`select adult_confirmed_at from users where id = ${me}`;
        const romantic = !!u?.adult_confirmed_at && !!ch.romantic;
        try {
          const media = await startMedia(me, { kind: "image", with_me: true, they_asked: true, description: "a photo of you right now, as if you're with them in person" }, {
            characterId: ch.id, who: ch.name, appearance: ch.appearance || "", refs: [], romantic, offer: false,
          });
          return NextResponse.json({ media });
        } catch (e) {
          return bad(e instanceof MediaError ? e.message : "Couldn't take that photo right now.");
        }
      }
case "chats.unread": {
        const rows = await db`select m.character_id, count(*)::int as n from velo_messages m
          left join chat_reads r on r.user_id = m.user_id and r.character_id is not distinct from m.character_id
          where m.user_id = ${me} and m.role = 'assistant' and m.created_at > coalesce(r.read_at, '-infinity'::timestamptz)
          group by m.character_id`;
        return NextResponse.json({ unread: Object.fromEntries(rows.map(r => [r.character_id ? String(r.character_id) : "velo", Number(r.n)])) });
      }
      case "chats.read": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        await db`insert into chat_reads (user_id, character_id, read_at) values (${me}, ${ch?.id || null}, now())
          on conflict (user_id, coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set read_at = now()`;
        return NextResponse.json({ ok: true });
      }

      // 🤝 How much this character trusts them (null when trust is off for that character).
      case "relationship.get": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (!ch) return bad("That character wasn't found.");
        return NextResponse.json({ trust: await trustFor(me, ch) });
      }
      case "media.check": {
        const m = needId() ? await checkMedia(me, id) : null;
        return m ? NextResponse.json({ media: m }) : bad("Unknown media.");
      }
      // 🖼️ Gallery for one chat (Velo's or a character's): newest first, 30 at a time.
      case "gallery.list": {
        const ch = b.characterId ? await getCharacterFor(me, String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        const before = typeof b.before === "string" && !Number.isNaN(Date.parse(b.before)) ? b.before : null;
        return NextResponse.json({ items: await listGallery(me, ch?.id || null, before) });
      }
      case "gallery.keep":
        if (!needId()) return bad("Unknown picture.");
        await db`update velo_media set kept = ${!!b.kept} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      case "gallery.delete":
        return needId() && (await deleteMedia(me, id)) ? NextResponse.json({ ok: true }) : bad("Unknown picture.");
      case "media.sweep":
        return NextResponse.json({ media: await sweepMedia(me) });

      case "reminders.list": {
        const rows = await db`select id, text, remind_at, status from velo_reminders where user_id = ${me} and status in ('pending', 'sent') order by remind_at limit 50`;
        return NextResponse.json({ reminders: rows });
      }
      case "reminders.due": {
        // Claims due reminders (marks them sent) so each pops up once.
        const rows = await db`update velo_reminders set status = 'sent', sent_at = now()
          where user_id = ${me} and status = 'pending' and remind_at <= now() returning id, text`;
        return NextResponse.json({ due: rows });
      }
      case "reminders.dismiss":
        if (!needId()) return bad("Unknown reminder.");
        await db`update velo_reminders set status = 'dismissed' where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "tasks.list": {
        const rows = await db`select id, text, due_date::text as due_date, done from velo_tasks
          where user_id = ${me} and (done = false or done_at > now() - interval '1 day') order by created_at limit 100`;
        return NextResponse.json({ tasks: rows });
      }
      case "tasks.add": {
        const text = clean(b.text, 300);
        if (!text) return bad("Say what the to-do is.");
        await db`insert into velo_tasks (user_id, text) values (${me}, ${text})`;
        return NextResponse.json({ ok: true });
      }
      case "tasks.toggle":
        if (!needId()) return bad("Unknown to-do.");
        await db`update velo_tasks set done = ${!!b.done}, done_at = ${b.done ? new Date().toISOString() : null} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      case "tasks.delete":
        if (!needId()) return bad("Unknown to-do.");
        await db`delete from velo_tasks where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "memories.list": {
        const rows = await db`select id, kind, text, status, created_at from velo_memories where user_id = ${me} and character_id is null order by created_at desc limit 300`;
        return NextResponse.json({ memories: rows });
      }
      case "memories.delete":
        if (!needId()) return bad("Unknown memory.");
        await db`delete from velo_memories where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "contacts.list": {
        const rows = await db`select id, name, phone from velo_contacts where user_id = ${me} order by lower(name) limit 500`;
        return NextResponse.json({ contacts: rows.map(r => ({ id: r.id, name: r.name, phone: showPhone(String(r.phone)) })) });
      }
      case "contacts.add": {
        const name = clean(b.name, 80), phone = toE164(b.phone);
        if (!name) return bad("Add a name.");
        if (!phone) return bad(PHONE_MSG);
        await db`insert into velo_contacts (user_id, name, phone) values (${me}, ${name}, ${phone}) on conflict (user_id, lower(name)) do update set phone = excluded.phone`;
        return NextResponse.json({ ok: true });
      }
      case "contacts.delete":
        if (!needId()) return bad("Unknown contact.");
        await db`delete from velo_contacts where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "drafts.list": {
        // Recent texts and calls Velo drafted or made, for the chat's cards.
        const rows = await db`select id, kind, to_name, to_phone, body, status, result from velo_actions
          where user_id = ${me} and kind in ('text', 'call', 'post') and created_at > now() - interval '2 days' order by created_at limit 30`;
        return NextResponse.json({ drafts: rows });
      }

      case "files.list": {
        const rows = await db`select id, url, thumb_url, name, content_type, size, created_at from velo_files where user_id = ${me} and kind = 'file' order by created_at desc limit 200`;
        return NextResponse.json({ files: rows });
      }
      case "files.delete":
        if (!needId()) return bad("Unknown file.");
        return (await deleteFile(me, id)) ? NextResponse.json({ ok: true }) : bad("That file wasn't found.");
      case "face.remove": {
        const faces = await db`select id from velo_files where user_id = ${me} and kind = 'face'`;
        for (const f of faces) await deleteFile(me, String(f.id));
        await db`update users set look = 'default', updated_at = now() where id = ${me} and look = 'custom'`;
        return NextResponse.json({ ok: true });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("data", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
