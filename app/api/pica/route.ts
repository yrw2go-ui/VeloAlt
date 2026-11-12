import { NextRequest, NextResponse, after } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { sql } from "../../lib/db";
import { MediaError, mediaReady } from "../../lib/media";
import { dmThreads, dmUnread, dmOpen, dmSend, dmSendPhoto, dmBrain, DmError } from "../../lib/picaDm";
import { ensurePicaDays, picaFeed, picaComments, picaLike, picaSeen, picaComment, picaPost, picaLooked, picaFollow, picaProfile, picaSave, picaSavedList, picaFollowing, picaBefriend, picaCounts, picaDeletePost, picaNew, picaFromPhoto, PicaLimit } from "../../lib/picagram";

// 📸 Picagram. POST { action, ... }:
//   feed { before? } → { posts }   (a few at a time; today's and missed days' posts are made as needed)
//   comments { id } → { comments }   like { id, on }   seen { ids }   comment { id, text } → { added }
//   follow { id, on }   profile { id } → { account, photos }   save { id: mediaId, on }   saved { before? } → { items }   (🔖 their Picagram gallery)
//   following → { accounts } (up to 70)   befriend { id } → { characterId }   (🤝 she becomes a character)
//   post { caption, photo?, useMyPhotos? } → { id }   (photo: a description; Atlas makes it)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return bad("Please sign in again.", 401);
    const me = c.userId;
    const b = await req.json().catch(() => ({}));
    const id = String(b.id || "");
    switch (String(b.action || "")) {
      case "feed": {
        const before = typeof b.before === "string" && !Number.isNaN(Date.parse(b.before)) ? b.before : null;
        // First visit ever: make today's posts now; otherwise catch up in the background.
        if (!before) {
          // ⏸️ After 4 days without a look it was paused: it picks up again from today (no make-up days).
          const active = await picaLooked(me);
          const [any] = await sql()`select 1 from pica_posts where user_id = ${me} limit 1`;
          if (!any) await ensurePicaDays(me, 0).catch(e => console.error("pica: first", e instanceof Error ? e.message : e));
          else after(() => ensurePicaDays(me, active ? 2 : 0).then(() => {}, e => console.error("pica: catch up", e instanceof Error ? e.message : e)));
        }
        return NextResponse.json({ posts: await picaFeed(me, before, 6) });
      }
      case "counts": return NextResponse.json({ counts: await picaCounts(me, Array.isArray(b.ids) ? b.ids.map(String) : []) });
      case "delete": return UUID.test(id) && (await picaDeletePost(me, id)) ? NextResponse.json({ ok: true }) : bad("You can only delete your own posts.");
      case "fromPhoto": {
        if (!UUID.test(id)) return bad("Unknown photo.");
        if (!allow(`pica-f:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ accountId: await picaFromPhoto(me, id) });
      }
      // ✉️ DMs with accounts (characters chat in the normal chat).
      case "dm.threads": return NextResponse.json({ threads: await dmThreads(me) });
      case "dm.open": return UUID.test(id) ? NextResponse.json(await dmOpen(me, id)) : bad("Unknown account.");
      case "dm.brain": return UUID.test(id) && (await dmBrain(me, id, String(b.brain ?? ""))) ? NextResponse.json({ ok: true }) : bad("Unknown account.");
      case "dm.send":
      case "dm.photo": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-dm:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 600 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json(b.action === "dm.photo" ? await dmSendPhoto(me, id) : await dmSend(me, id, String(b.text || "")));
      }
      case "new": return NextResponse.json({ n: await picaNew(me), dms: await dmUnread(me) });
      case "following": return NextResponse.json({ accounts: await picaFollowing(me) });
      case "befriend": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-f:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ characterId: await picaBefriend(me, id) });
      }
      case "follow": return UUID.test(id) && (await picaFollow(me, id, b.on === true)) ? NextResponse.json({ ok: true }) : bad("Unknown account.");
      case "profile": { const p = UUID.test(id) ? await picaProfile(me, id) : null; return p ? NextResponse.json(p) : bad("Unknown account."); }
      case "save": return UUID.test(id) && (await picaSave(me, id, b.on === true)) ? NextResponse.json({ ok: true }) : bad("Unknown picture.");
      case "saved": return NextResponse.json({ items: await picaSavedList(me, typeof b.before === "string" && !Number.isNaN(Date.parse(b.before)) ? b.before : null) });
      // 🆕 Posts that went up since the newest one on screen (they slide in at the top).
      case "newer": {
        const after = typeof b.after === "string" && !Number.isNaN(Date.parse(b.after)) ? b.after : null;
        return NextResponse.json({ posts: after ? await picaFeed(me, null, 20, after) : [] });
      }
      case "comments": return UUID.test(id) ? NextResponse.json({ comments: await picaComments(me, id) }) : bad("Unknown post.");
      case "like": return UUID.test(id) && (await picaLike(me, id, b.on === true)) ? NextResponse.json({ ok: true }) : bad("Unknown post.");
      case "seen": await picaSeen(me, Array.isArray(b.ids) ? b.ids.map(String) : []); return NextResponse.json({ ok: true });
      case "comment": {
        if (!UUID.test(id)) return bad("Unknown post.");
        if (!allow(`pica-c:${me}`, [{ ms: 60_000, max: 12 }, { ms: 86_400_000, max: 400 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ added: await picaComment(me, id, String(b.text || "")) });
      }
      case "post": {
        if (!allow(`pica-p:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 30 }])) return bad("That's a lot of posts — try again in a bit.", 429);
        if (String(b.photo || "").trim() && !mediaReady()) return bad("Photos aren't set up yet.");
        return NextResponse.json({ id: await picaPost(me, String(b.caption || ""), String(b.photo || ""), b.useMyPhotos === true) });
      }
      default: return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof PicaLimit || e instanceof DmError) return bad(e.message);
    if (e instanceof MediaError) return bad(e.message.replace(/ Tell them.*$/, ""));
    console.error("pica", e instanceof Error ? e.message : e);
    return bad("Something went wrong.", 500);
  }
}
