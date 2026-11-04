import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { askVelo, askCharacter, CharacterGone, aiReady, aiError, type Mode, type Turn } from "../../lib/brain";

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

    // 🎭 A character's chat (plain chat only; memory notes and calls are Velo's).
    if (body.characterId) {
      if (mode !== "chat") return NextResponse.json({ ok: true, reply: "" });
      const r = await askCharacter(caller, { characterId: String(body.characterId), messages, name: body.name });
      return NextResponse.json({ reply: r.reply });
    }
    const r = await askVelo(caller, { mode, messages, timeZone: body.timeZone, name: body.name });
    if (mode === "remember" || mode === "memo") return NextResponse.json({ ok: !!r.saved, reply: "" });
    return NextResponse.json({ reply: r.reply, ...(r.changed ? { changed: true } : {}), ...(r.drafts.length ? { drafts: r.drafts } : {}) });
  } catch (e) {
    if (e instanceof CharacterGone) return NextResponse.json({ error: "That character was deleted." }, { status: 404 });
    const { error, status } = aiError(e);
    return NextResponse.json({ error }, { status });
  }
}
