import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { aiReady, aiError } from "../../lib/brain";
import { listGroups, getGroup, createGroup, deleteGroup, groupMessages, sendToGroup, rememberGroup, startGroupScene, endGroupScene, banterNext, reactInGroup, editGroupMessage, draftGroupPeek, groupPeekAt, bringTogether, endGroupInPerson, deleteGroupMessages, GroupError, draftGroupPhoto, groupPhoto, shareToGroup, groupFaces } from "../../lib/groups";
import { MediaError, mediaReady } from "../../lib/media";
import { availableBrains } from "../../lib/models";
import { sql } from "../../lib/db";
import { getCharacterFor } from "../../lib/characters";
import { awayFor, awayText } from "../../lib/picagram";
import { isReaction } from "../../lib/reactions";
import { scrub } from "../../lib/secrets";

// 👥 Group chats. POST { action, ... }:
//   list → { groups }                         create { memberIds, title?, name? } → { group }
//   messages { id } → { messages }            send { id, text, timeZone, name } → { replies }
//   send → { replies, banter }   banter { id, timeZone, name } → { message, more }   (💬 the characters chatting among themselves)
//   memo { id, timeZone, name } → { saved }   (each character saves her own memory)
//   delete { id }   react { id, msgId, reaction|null } (😮 theirs on a character's message)
//   scene.start { id, kind: live|past, title, details } → { marker, group }   scene.end { id } → { marker }
//   messages.delete { id, ids (1–10), timeZone, name } → { deleted, replies }   (🗑 they forget what was in them; your latest gets re-answered)
//   bring { fromId, ids, place } → { group }   (🧍 bring characters together in person; their 1:1s carry over)   inperson.end { id } → { marker }
//   photo.draft { id, ids, withMe, about } → { description }   photo { id, ids, withMe, from, description } → { added }
//   peek.draft { id, ids } → { description }   peek { id, ids, description } → { added }   (👀 nobody in the group knows)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// 🧠 Who writes a peek description: the brain picked in the dropdown ('' or 'claude' = Claude).
const writerBrain = (picked: unknown): string => {
  const p = typeof picked === "string" ? picked : "";
  return availableBrains().includes(p) ? p : "";
};

export async function POST(req: NextRequest) {
  // 📣 Kept out here so that if something goes wrong we can still say which action it was.
  let which = "?";
  try {
    const c = await resolveCaller(req);
    if (!c) return bad("Please sign in again.", 401);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");
    which = action;
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
      for (const cid of ok) { const gone = await awayFor(c.userId, cid); if (gone) { const [ch] = await sql()`select name from chat_characters where id = ${cid}`; return bad(awayText(String(ch?.name || "They"), gone)); } }
      return NextResponse.json({ group: await bringTogether(c.userId, ok[0], ok.slice(1), String(b.place || ""), name) });
    }
    const g = await getGroup(c.userId, String(b.id || ""));
    if (!g) return bad("That group wasn't found.", 404);
    switch (action) {
      // 🧑‍🤝‍🧑 The messages come with who's in the group — their names and faces. The screen used to
      // look each speaker up in the characters list the app loads separately, so when that request
      // failed or hung, everyone in the group was called "Someone" and nothing said why.
      case "messages": {
        // 👀 Opening it is reading it: the unread count on the list clears from here.
        await sql()`insert into chat_group_reads (user_id, group_id, read_at) values (${c.userId}, ${g.id}, now())
          on conflict (user_id, group_id) do update set read_at = now()`.catch(() => {});
        return NextResponse.json({ messages: await groupMessages(c.userId, g.id), members: await groupFaces(g) });
      }
      case "delete": return NextResponse.json({ ok: await deleteGroup(c.userId, g.id) });
      case "send": {
        if (!aiReady()) return bad("Velo isn't set up yet (missing AI settings).", 503);
        if (!allow(c.userId)) return bad("That's a lot of messages — give it a minute and try again.", 429);
        return NextResponse.json(await sendToGroup(c, g, String(b.text || ""), b.timeZone, name, String(b.privateTo || "")));
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
      // ✏️ Reword a line by double-tapping it — yours or one of theirs.
      case "messages.edit": {
        const text = scrub(String(b.text ?? "").replace(/\r/g, "").trim()).slice(0, 4000);
        if (!text) return bad("A message can't be empty — delete it instead.");
        const r = await editGroupMessage(c, g, String(b.msgId || ""), text, name);
        if (!r) return bad("That one can't be edited.");
        return NextResponse.json(r);
      }
      case "messages.delete": {
        const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
        if (!ids.length || ids.length > 10) return bad("Pick 1 to 10 messages.");
        return NextResponse.json(await deleteGroupMessages(c, g, ids, b.timeZone, name));
      }
      case "inperson.end": return NextResponse.json({ marker: await endGroupInPerson(c.userId, g) });
      // 📸 A photo in the group: who's in it (three faces at most, counting you), then the
      // description — blank, written for you, or your own words. Everyone in the group sees it.
      case "photo.draft":
      case "photo": {
        if (!aiReady()) return bad("Velo isn't set up yet (missing AI settings).", 503);
        if (!allow(`groupphoto:${c.userId}`, [{ ms: 60_000, max: 4 }, { ms: 86_400_000, max: 100 }])) return bad("That's a lot of photos — give it a minute.", 429);
        const [u2] = await sql()`select adult_confirmed_at from users where id = ${c.userId}`;
        const who = Array.isArray(b.ids) ? b.ids.map(String) : [];
        const withMe = b.withMe === true;
        if (action === "photo.draft") return NextResponse.json({ description: await draftGroupPhoto(c.userId, g, who, withMe, String(b.about || ""), !!u2?.adult_confirmed_at, name, writerBrain(b.writer)) });
        if (!mediaReady()) return bad("Photos aren't set up yet.");
        return NextResponse.json({ added: await groupPhoto(c.userId, g, who, withMe, !!u2?.adult_confirmed_at, String(b.description || ""), name, String(b.from || "")) });
      }
      case "photo.share":
        return NextResponse.json({ messages: await shareToGroup(c.userId, g, String(b.mediaId || "")) });
      case "peek.draft":
      case "peek": {
        if (!aiReady()) return bad("Velo isn't set up yet (missing AI settings).", 503);
        if (!allow(`peek:${c.userId}`, [{ ms: 60_000, max: 6 }])) return bad("That's a lot of peeks — give it a minute.", 429);
        const [u] = await sql()`select adult_confirmed_at from users where id = ${c.userId}`;
        const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
        if (action === "peek.draft") return NextResponse.json({ description: await draftGroupPeek(c.userId, g, ids, !!u?.adult_confirmed_at, name, writerBrain(b.writer), b.withMe === true) });
        return NextResponse.json({ added: await groupPeekAt(c.userId, g, ids, !!u?.adult_confirmed_at, String(b.description || ""), b.withMe === true, name) });
      }
      case "memo": {
        if (!aiReady()) return NextResponse.json({ saved: 0 });
        return NextResponse.json({ saved: await rememberGroup(c, g, b.timeZone, name) });
      }
      default: return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof GroupError || e instanceof MediaError) return bad(e.message);
    // 📣 Say what went wrong. Without this line a group that won't open leaves nothing behind
    // at all — the phone shows an error and the logs show silence, which is no way to find it.
    console.error(`groups ${which}`, e instanceof Error ? e.message : e);
    const { error, status } = aiError(e);
    return bad(error, status);
  }
}
