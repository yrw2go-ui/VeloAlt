import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { isValidTimeZone } from "../../lib/localTime";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { toE164, showPhone, twilioReady, veloNumber } from "../../lib/twilio";
import { PHONE_MSG } from "../../lib/contact";
import { scrub } from "../../lib/secrets";
import { availableModels, CHAT_MODELS, MODEL_INFO, type ChatModel } from "../../lib/models";
import { PERSONALITIES } from "../../lib/persona";
import { deleteFile, ownFile } from "../../lib/files";
import { getCharacter } from "../../lib/characters";
import { checkMedia, sweepMedia, getMedia, listGallery, deleteMedia, VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "../../lib/media";

// 📦 Everything the app reads and changes, for the signed-in person only.
// POST { action, ...args } → { ... }. Every query is scoped to their user_id.
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
        const [u] = await db`select name, look, time_zone, plan, phone, phone_verified_at, chat_model, personality, adult_confirmed_at, video_model from users where id = ${me}`;
        const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${me} and kind = 'call' and character_id is null`;
        const [face] = await db`select url from velo_files where user_id = ${me} and kind = 'face' order by created_at desc limit 1`;
        return NextResponse.json({
          name: u?.name || "", look: u?.look === "custom" && !face ? "default" : u?.look || "default", customFace: face ? String(face.url) : "",
          timeZone: u?.time_zone || null, hadCall: n > 0,
          plan: u?.plan || "free", proForSale: !!process.env.STRIPE_PRICE_PRO && twilioReady(),
          phone: u?.phone ? showPhone(String(u.phone)) : "", phoneVerified: !!u?.phone_verified_at, veloNumber: veloNumber(),
          chatModel: availableModels().includes(u?.chat_model) ? u?.chat_model : "claude",
          models: availableModels().map(id => ({ id, ...MODEL_INFO[id] })),
          videoModel: VIDEO_MODELS.some(m => m.id === u?.video_model) ? u?.video_model : DEFAULT_VIDEO_MODEL,
          videoModels: VIDEO_MODELS.map(m => ({ id: m.id, label: m.label })),
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
        if (VIDEO_MODELS.some(m => m.id === b.videoModel)) await db`update users set video_model = ${b.videoModel}, updated_at = now() where id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      case "messages.list": {
        // Velo's chat (no characterId) or one character's chat.
        const ch = b.characterId ? await getCharacter(String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        const rows = await db`select m.role, m.content, f.id as file_id, f.url as file_url, f.name as file_name, f.content_type as file_type,
            md.id as media_id, md.kind as media_kind, md.status as media_status, mf.url as media_url, coalesce(mt.url, md.poster_url) as media_thumb
          from velo_messages m left join velo_files f on f.id = m.file_id and f.user_id = m.user_id
          left join velo_media md on md.id = m.media_id and md.user_id = m.user_id
          left join velo_files mf on mf.id = md.file_id
          left join velo_files mt on mt.id = md.thumb_file_id
          where m.user_id = ${me} and m.character_id is not distinct from ${ch?.id || null} order by m.created_at desc, m.id desc limit 60`;
        return NextResponse.json({ messages: rows.reverse().map(r => ({ role: r.role, content: r.content,
          ...(r.file_id ? { file: { id: r.file_id, url: r.file_url, name: r.file_name, type: r.file_type } } : {}),
          ...(r.media_id ? { media: { id: r.media_id, kind: r.media_kind, status: r.media_status, url: r.media_status === "done" ? r.media_url : null, thumb: r.media_thumb || null } } : {}) })) });
      }
      case "messages.add": {
        const ch = b.characterId ? await getCharacter(String(b.characterId)) : null;
        if (b.characterId && !ch) return bad("That character wasn't found.");
        const list = (Array.isArray(b.messages) ? b.messages : []).slice(0, 4)
          .map((m: { role?: string; content?: unknown; fileId?: unknown; mediaId?: unknown }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: scrub(String(m.content || "").slice(0, 8000)), fileId: String(m.fileId || ""), mediaId: String(m.mediaId || "") }))
          .filter((m: { content: string; fileId: string; mediaId: string }) => m.content || m.fileId || m.mediaId);
        // A millisecond apart so they always sort in the order sent.
        const at = Date.now() - list.length;
        for (const [i, m] of list.entries()) {
          // Only their own file can be attached.
          const f = m.fileId && m.role === "user" && !ch ? await ownFile(me, m.fileId) : null;
          // A photo/video sent in this same chat (theirs, and from this Velo/character).
          const md = m.mediaId && m.role === "assistant" ? await getMedia(me, m.mediaId) : null;
          const mediaId = md && md.character_id === (ch?.id || null) ? md.id : null;
          await db`insert into velo_messages (user_id, role, content, file_id, media_id, character_id, created_at) values (${me}, ${m.role}, ${m.content || (mediaId ? "(sent a photo)" : "📎")}, ${f?.id || null}, ${mediaId}, ${ch?.id || null}, ${new Date(at + i).toISOString()})`;
        }
        return NextResponse.json({ ok: true });
      }
      case "messages.clear":
        // Velo's chat only; each character's chat goes when the character is deleted.
        await db`delete from velo_messages where user_id = ${me} and character_id is null`;
        return NextResponse.json({ ok: true });

      // 🎨 Photos/videos: check one (saves it once ready), or sweep all unfinished ones.
      case "media.check": {
        const m = needId() ? await checkMedia(me, id) : null;
        return m ? NextResponse.json({ media: m }) : bad("Unknown media.");
      }
      // 🖼️ Gallery for one chat (Velo's or a character's): newest first, 30 at a time.
      case "gallery.list": {
        const ch = b.characterId ? await getCharacter(String(b.characterId)) : null;
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
        const rows = await db`select id, url, name, content_type, size, created_at from velo_files where user_id = ${me} and kind = 'file' order by created_at desc limit 200`;
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
