import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { askVelo, CharacterGone, BrainDown, aiReady, aiError, type Mode, type Turn } from "../../lib/brain";
import { getCharacterFor } from "../../lib/characters";
import { sql } from "../../lib/db";
import { holdsOnWhenDown } from "../../lib/models";
import { mediaNote } from "../../lib/media";

// 💬 Velo in the app: chat, in-app calls, recaps and memory (see lib/brain.ts).
// POST { mode, messages: [{role, content}], timeZone, name } → { reply, changed?, drafts? }
const MODES: Mode[] = ["chat", "talk", "recap", "remember", "memo"];

export async function POST(req: NextRequest) {
  try {
    if (!aiReady()) return NextResponse.json({ error: "Velo isn't set up yet (missing AI settings)." }, { status: 503 });
    const caller = await resolveCaller(req);
    if (!caller) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!allow(caller.userId)) return NextResponse.json({ error: "That's a lot of messages — give it a minute and try again." }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const mode: Mode = MODES.includes(body.mode) ? body.mode : "chat";
    const messages: Turn[] = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return NextResponse.json({ error: "No messages provided" }, { status: 400 });

    // 🎭 A character's chat or call, with that character's own memory of them.
    const character = body.characterId ? await getCharacterFor(caller.userId, String(body.characterId)) : null;
    if (body.characterId && !character) throw new CharacterGone();
    // ⏰ A chat with a character on her own brain: if it's down, no stand-in (see BrainDown below).
    const noFallback = mode === "chat" && holdsOnWhenDown(character?.brain);
    let r;
    try { r = await askVelo(caller, { mode, messages, timeZone: body.timeZone, name: body.name, character, origin: req.nextUrl.origin, noFallback }); }
    catch (e) {
      if (!(e instanceof BrainDown)) throw e;
      // First time: she says she'll be right back. On retries: nothing to show yet.
      return NextResponse.json({ brainDown: true, reply: body.retry ? "" : "hold on, I'll be right back" });
    }
    if (mode === "remember" || mode === "memo") return NextResponse.json({ ok: !!r.saved, reply: "" });
    // 😮 Their reaction to the person's latest message, saved as a badge on it.
    if (r.react && typeof body.replyTo === "string" && /^[0-9a-f-]{36}$/i.test(body.replyTo)) {
      await sql()`update velo_messages set their_reaction = ${r.react} where id = ${body.replyTo} and user_id = ${caller.userId} and role = 'user' and character_id is not distinct from ${character?.id || null}`;
    }
    // 🎨 Photos/videos on their way are saved into this chat here (so they're never lost), just after the reply.
    for (const [i, m] of r.media.filter(x => x.status !== "failed").entries()) {
      await sql()`insert into velo_messages (user_id, role, content, media_id, character_id, created_at)
        values (${caller.userId}, 'assistant', ${mediaNote(m.kind, m.status, m.description, null, m.subject)}, ${m.id}, ${character?.id || null}, now() + ${`${2000 + i} milliseconds`}::interval)`;
    }
    return NextResponse.json({ reply: r.reply, ...(r.changed ? { changed: true } : {}), ...(r.drafts.length ? { drafts: r.drafts } : {}), ...(r.media.length ? { media: r.media } : {}), ...(r.react ? { react: r.react } : {}), ...(r.by ? { by: r.by } : {}) });
  } catch (e) {
    if (e instanceof CharacterGone) return NextResponse.json({ error: "That character was deleted." }, { status: 404 });
    const { error, status } = aiError(e);
    return NextResponse.json({ error }, { status });
  }
}
