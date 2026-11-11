import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { aiReady, aiError } from "../../lib/brain";
import { listGroups, getGroup, createGroup, deleteGroup, groupMessages, sendToGroup, rememberGroup, startGroupScene, endGroupScene, banterNext, reactInGroup, draftGroupPeek, groupPeekAt, bringTogether, endGroupInPerson, GroupError } from "../../lib/groups";
import { MediaError } from "../../lib/media";
import { sql } from "../../lib/db";
import { getCharacterFor } from "../../lib/characters";
import { isReaction } from "../../lib/reactions";

// 👥 Group chats. POST { action, ... }:
//   list → { groups }                         create { memberIds, title?, name? } → { group }
//   messages { id } → { messages }            send { id, text, timeZone, name } → { replies }
//   send → { replies, banter }   banter { id, timeZone, name } → { message, more }   (💬 the characters chatting among themselves)
//   memo { id, timeZone, name } → { saved }   (each character saves her own memory)
//   delete { id }   react { id, msgId, reaction|null } (😮 theirs on a character's message)
//   scene.start { id, kind: live|past, title, details } → { marker, group }   scene.end { id } → { marker }
//   bring { fromId, ids, place } → { group }   (🧍 bring characters together in person; their 1:1s carry over)   inperson.end { id } → { marker }
//   peek.draft { id, ids } → { description }   peek { id, ids, description } → { added }   (👀 nobody in the group knows)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return bad("Please sign in again.", 401);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");
    const name = String(b.name || "").trim().split(/\s+/)[0].slice(0, 40);
    if (action === "list") return NextResponse.json({ groups: await listGroups(c.userId) });
    if (action === "create") {
      if (!allow(`groups:${c.userId}`, [{ ms: 60_000, max: 5 }, { ms: 86_400_000, max: 50 }])) return bad("That's a lot of new groups — try again in a bit.", 429);
      return NextResponse.json({ group: await createGroup(c.userId, Array.isArray(b.memberIds) ? b.memberIds.map(String) : [], String(b.title || ""), name) });
    }
    if (action === "bring") {
      if (!allow(`groups:${c.userId}`, [{ ms: 60_000, max: 5 }, { ms: 86_400_000, max: 50 }])) return bad("That's a lot — try again in a bit.", 429);
      const ids = [String(b.fromId || ""), ...(Array.isArray(b.ids) ? b.ids.map(String) : [])];
      const ok = (await Promise.all(ids.map(id => getCharacterFor(c.userId, id)))).filter(Boolean).map(ch => ch!.id);
      if (ok.length < ids.length) return bad("That character wasn't found.");
      return NextResponse.json({ group: await bringTogether(c.userId, ok[0], ok.slice(1), String(b.place || ""), name) });
    }
    const g = await getGroup(c.userId, String(b.id || ""));
    if (!g) return bad("That group wasn't found.", 404);
    switch (action) {
      case "messages": return NextResponse.json({ messages: await groupMessages(c.userId, g.id) });
      case "delete": return NextResponse.json({ ok: await deleteGroup(c.userId, g.id) });
      case "send": {
        if (!aiReady()) return bad("Velo isn't set up yet (missing AI settings).", 503);
        if (!allow(c.userId)) return bad("That's a lot of messages — give it a minute and try again.", 429);
        return NextResponse.json(await sendToGroup(c, g, String(b.text || ""), b.timeZone, name));
      }
      // 💬 The next line of the characters talking among themselves → { message, more }.
      case "banter": {
        if (!aiReady()) return NextResponse.json({ message: null, more: false });
        return NextResponse.json(await banterNext(c, g, b.timeZone, name));
      }
      case "react": {
        const reaction = isReaction(b.reaction) ? b.reaction : null;
        return NextResponse.json({ ok: await reactInGroup(c.userId, g, String(b.msgId || ""), reaction) });
      }
      case "scene.start": {
        const marker = await startGroupScene(c.userId, g, b.kind === "past" ? "past" : "live", String(b.title || ""), String(b.details || ""), b.clock === "set" ? String(b.time || "") : "");
        return NextResponse.json({ marker, group: await getGroup(c.userId, g.id) });
      }
      case "scene.end": return NextResponse.json({ marker: await endGroupScene(c.userId, g) });
      case "inperson.end": return NextResponse.json({ marker: await endGroupInPerson(c.userId, g) });
      case "peek.draft":
      case "peek": {
        if (!aiReady()) return bad("Velo isn't set up yet (missing AI settings).", 503);
        if (!allow(`peek:${c.userId}`, [{ ms: 60_000, max: 6 }])) return bad("That's a lot of peeks — give it a minute.", 429);
        const [u] = await sql()`select adult_confirmed_at from users where id = ${c.userId}`;
        const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
        if (action === "peek.draft") return NextResponse.json({ description: await draftGroupPeek(c.userId, g, ids, !!u?.adult_confirmed_at, name) });
        return NextResponse.json({ added: await groupPeekAt(c.userId, g, ids, !!u?.adult_confirmed_at, String(b.description || "")) });
      }
      case "memo": {
        if (!aiReady()) return NextResponse.json({ saved: 0 });
        return NextResponse.json({ saved: await rememberGroup(c, g, b.timeZone, name) });
      }
      default: return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof GroupError || e instanceof MediaError) return bad(e.message);
    const { error, status } = aiError(e);
    return bad(error, status);
  }
}
