import { NextRequest, NextResponse, after } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { sql } from "../../lib/db";
import { availableBrains } from "../../lib/models";
import { retryChoices, befriendChoices } from "../../lib/pickBrain";
import { MediaError, mediaReady } from "../../lib/media";
import { dmThreads, dmUnread, dmOpen, dmSend, dmSendPhoto, dmPhotoMake, dmBrain, dmMyPhotoDraft, dmMyPhoto, dmSendMine, DmError, dmDelete, dmEdit } from "../../lib/picaDm";
import { ensurePicaDays, picaFeed, picaComments, picaLike, picaSeen, picaComment, picaPost, picaLooked, picaFollow, picaProfile, picaSave, picaSetAvatar, picaRefs, picaSavedList, picaFollowing, picaBefriend, picaCounts, picaDeletePost, picaCreateAccount, picaPictureAbout, picaRedoDraft, picaRedo, picaWithMe, picaMe, picaMeBio, picaBio, picaPersona, picaLives, picaName, picaHandle, picaCaption, picaCharacters, picaHide, accountFor, picaNew, picaFromPhoto, myPhotoDraft, newFaces, picaDeleteAccount, PicaLimit, picaCommentEdit } from "../../lib/picagram";

// 📸 Picagram. POST { action, ... }:
//   feed { before? } → { posts }   (a few at a time; today's and missed days' posts are made as needed)
//   comments { id } → { comments }   like { id, on }   seen { ids }   comment { id, text } → { added }
//   follow { id, on }   profile { id } → { account, photos }   save { id: mediaId, on }   saved { before? } → { items }   (🔖 their Picagram gallery)
//   following → { accounts } (up to 70)   befriend.who → { choices }   befriend { id, brain? } → { characterId }   (🤝 she becomes a character)
//   post { caption, photo?, useMyPhotos?, withId? } → { id }   (photo: a description; Atlas makes it; withId: a character in it with you)
//   mine → { characters } (who you could put in a photo with you)
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Three new faces each take a model call and a photo start. The default limit kills that mid-way and the button looks like it did nothing.
export const maxDuration = 60;
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
      // 🗑 The post, and the picture with it only if they said so.
      case "delete": return UUID.test(id) && (await picaDeletePost(me, id, b.picture !== false)) ? NextResponse.json({ ok: true }) : bad("That post wasn't found.");
      case "fromPhoto": {
        if (!UUID.test(id)) return bad("Unknown photo.");
        if (!allow(`pica-f:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ accountId: await picaFromPhoto(me, id) });
      }
      // ✉️ DMs with accounts (characters chat in the normal chat).
      case "dm.threads": return NextResponse.json({ threads: await dmThreads(me) });
      case "dm.open": return UUID.test(id) ? NextResponse.json(await dmOpen(me, id)) : bad("Unknown account.");
      // 📸 A photo of you: the description to check (step 1), then exactly that (step 2).
      case "me.draft": {
        if (!allow(`pica-draft:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 300 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ description: await myPhotoDraft(me, String(b.about || ""), String(b.context || "")) });
      }
      case "dm.me.draft": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-draft:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 300 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ description: await dmMyPhotoDraft(me, id, String(b.about || "")) });
      }
      // 🖼️ One you already have: from your gallery, or just uploaded from the phone.
      case "dm.me.send": {
        if (!UUID.test(id) || !UUID.test(String(b.mediaId || ""))) return bad("Unknown account.");
        if (!allow(`pica-dm:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 600 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json(await dmSendMine(me, id, String(b.mediaId)));
      }
      case "dm.me.photo": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!mediaReady()) return bad("Photos aren't set up yet.");
        if (!allow(`pica-dm:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 600 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json(await dmMyPhoto(me, id, String(b.description || "")));
      }
      // ✏️ Reword one of the written messages in a thread (double-tap it). Pictures stay as they are.
      case "dm.edit": {
        if (!UUID.test(id)) return bad("Unknown thread.");
        const out = await dmEdit(me, id, String(b.messageId || ""), String(b.text ?? ""));
        return out ? NextResponse.json(out) : bad("That one can't be edited.");
      }
      // 🗑 Written messages in a thread, gone. Pictures aren't deletable here.
      case "dm.delete": {
        if (!UUID.test(id)) return bad("Unknown thread.");
        const n = await dmDelete(me, id, Array.isArray(b.ids) ? b.ids.map(String) : []);
        return n ? NextResponse.json({ deleted: n }) : bad("Nothing to delete — pictures stay.");
      }
      case "dm.brain": return UUID.test(id) && (await dmBrain(me, id, String(b.brain ?? ""))) ? NextResponse.json({ ok: true }) : bad("Unknown account.");
      case "dm.send":
      case "dm.photo": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-dm:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 600 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json(b.action === "dm.photo" ? await dmSendPhoto(me, id) : await dmSend(me, id, String(b.text || "")));
      }
      // 📸 Her photo in the DMs, sent the way a peek is: exactly what you've got in front of you.
      case "dm.photo.make": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-dm:${me}`, [{ ms: 60_000, max: 15 }, { ms: 86_400_000, max: 600 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json(await dmPhotoMake(me, id, String(b.description || "")));
      }
      case "new": return NextResponse.json({ n: await picaNew(me), dms: await dmUnread(me) });
      // ✨ New women, posting right now (on top of the ones who show up on their own each day).
      // ✨ One new face at a time, written by the brain picked in Settings and nothing else.
      // If that brain can't manage it, the answer carries the other AIs you could retry with
      // and roughly what each would cost — your call, never a second spend behind your back.
      case "newfaces": {
        if (!allow(`pica-new:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("That's a lot of new faces — try again in a bit.", 429);
        const want = Math.max(1, Math.min(5, Number(b.count) || 1));
        // A retry names the AI to use; anything we can't reach is refused rather than guessed at.
        const pickBrain = typeof b.brain === "string" && (b.brain === "claude" || availableBrains().includes(b.brain)) ? b.brain : "";
        const r = await newFaces(me, want, pickBrain || undefined);
        if (r.made) return NextResponse.json(r);
        const [u] = await sql()`select chat_model from users where id = ${me}`;
        return NextResponse.json({ made: 0, names: [], tried: pickBrain || String(u?.chat_model || "claude"), retry: retryChoices(pickBrain || u?.chat_model, availableBrains()) });
      }
      // 👩 Make one yourself: your specs, your bio, your pictures.
      case "account.create": {
        if (!allow(`pica-mk:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("Slow down a little — try again in a bit.", 429);
        const r = await picaCreateAccount(me, {
          name: String(b.name || ""), handle: String(b.handle || ""), bio: String(b.bio || ""), look: String(b.look || ""),
          lives: String(b.lives || ""), followers: Number(b.followers) || 0, follow: b.follow === true,
          headshotMediaId: String(b.headshotMediaId || ""), shotMediaId: String(b.shotMediaId || ""),
        });
        return NextResponse.json(r);
      }
      // 👤 Your own Picagram page: your bio, your picture, your posts.
      case "me": return NextResponse.json(await picaMe(me));
      case "me.bio": return NextResponse.json({ bio: await picaMeBio(me, String(b.bio || "")) });
      // 🙈 Characters whose posts you'd rather not see (she can't tell).
      case "characters": return NextResponse.json({ characters: await picaCharacters(me) });
      case "hide": return UUID.test(id) && (await picaHide(me, id, b.on === true)) ? NextResponse.json({ ok: true }) : bad("Unknown character.");
      // ↻ Redo one of her pictures: the prompt that made it, then exactly what you send.
      case "redo.draft": {
        if (!UUID.test(id)) return bad("Unknown picture.");
        const d = await picaRedoDraft(me, id);
        return d ? NextResponse.json(d) : bad("That picture isn't one of hers.");
      }
      case "redo": {
        if (!UUID.test(id)) return bad("Unknown picture.");
        if (!mediaReady()) return bad("Photos aren't set up yet.");
        if (!allow(`pica-redo:${me}`, [{ ms: 60_000, max: 4 }, { ms: 86_400_000, max: 60 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ media: await picaRedo(me, id, String(b.prompt || "")) });
      }
      // 💬 What's in a picture you uploaded, in your words — her followers comment on this.
      case "picture.about": {
        if (!UUID.test(id)) return bad("Unknown picture.");
        return NextResponse.json({ ok: await picaPictureAbout(me, id, String(b.about || "")) });
      }
      // 👥 Who you could be in a picture with (your characters, the ones with a face on file first).
      case "withme": return NextResponse.json({ characters: await picaWithMe(me) });
      case "following": return NextResponse.json({ accounts: await picaFollowing(me) });
      // 🧠 Who you could have write her character card, before anything is spent. The brain
      // picked in Settings is marked as yours; the rest are there if you'd rather one of them.
      case "befriend.who": {
        const [u] = await sql()`select chat_model from users where id = ${me}`;
        return NextResponse.json({ choices: befriendChoices(u?.chat_model, availableBrains()) });
      }
      case "befriend": {
        if (!UUID.test(id)) return bad("Unknown account.");
        if (!allow(`pica-f:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 20 }])) return bad("Slow down a little — try again in a bit.", 429);
        // The one you chose in the popup, and only if we can actually reach it.
        const who = typeof b.brain === "string" && (b.brain === "claude" || availableBrains().includes(b.brain)) ? b.brain : "";
        return NextResponse.json({ characterId: await picaBefriend(me, id, who || undefined) });
      }
      // 🗑 Delete someone you don't like: her, her posts, her DMs and her pictures.
      case "account.delete": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaDeleteAccount(me, id);
        if (r === "unknown") return bad("Unknown account.");
        // She's one of your characters: her account stays — hide her posts instead.
        if (r === "friend") return bad("She's one of your characters — hide her posts instead (👥 Following), or delete her from her character card.");
        return NextResponse.json({ ok: true });
      }
      case "follow": return UUID.test(id) && (await picaFollow(me, id, b.on === true)) ? NextResponse.json({ ok: true }) : bad("Unknown account.");
      // 🖼️ Her profile picture, on its own — one of her photos, or one you uploaded for it.
      // 🎭 Her description and sliders. Someone you've befriended is a character — edit her there.
      case "persona.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaPersona(me, id, String(b.personality || ""), b.traits);
        if (r === "friend") return bad("She's one of your characters now — change her in her character card.");
        return r ? NextResponse.json(r) : bad("Unknown account.");
      }
      case "caption.set": {
        if (!UUID.test(id)) return bad("Unknown post.");
        const c = await picaCaption(me, id, String(b.caption || ""));
        return c === null ? bad("Unknown post.") : NextResponse.json({ caption: c });
      }
      case "handle.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaHandle(me, id, String(b.handle || ""));
        if (r === "friend") return bad("She's one of your characters now — change her in her character card.");
        if (r === "taken") return bad("That username is already someone else's.");
        return r === null ? bad("A username needs a couple of letters or numbers.") : NextResponse.json({ handle: r });
      }
      case "name.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaName(me, id, String(b.name || ""));
        if (r === "friend") return bad("She's one of your characters now — rename her in her character card.");
        return r === null ? bad("Give her a name.") : NextResponse.json({ name: r });
      }
      case "lives.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaLives(me, id, String(b.lives || ""));
        if (r === "friend") return bad("She's one of your characters now — change where she lives in her character card.");
        return r === null ? bad("Unknown account.") : NextResponse.json({ lives: r });
      }
      case "bio.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const bio = await picaBio(me, id, String(b.bio || ""));
        return bio === null ? bad("Unknown account.") : NextResponse.json({ bio });
      }
      // 🖼️ The pictures every new photo of her is built from.
      case "refs.set": {
        if (!UUID.test(id)) return bad("Unknown account.");
        const r = await picaRefs(me, id, (Array.isArray(b.mediaIds) ? b.mediaIds : []).map(String));
        if (r === "friend") return bad("She's one of your characters now — her pictures are on her character card.");
        return r ? NextResponse.json(r) : bad("Unknown account.");
      }
      case "avatar.set": {
        if (!UUID.test(id) || !UUID.test(String(b.mediaId || ""))) return bad("Unknown account.");
        const url = await picaSetAvatar(me, id, String(b.mediaId));
        return url ? NextResponse.json({ avatar: url }) : bad("That picture can't be her profile picture.");
      }
      case "profile": {
        if (!UUID.test(id)) return bad("Unknown account.");
        // Her character id works too: her page is made the first time you open it.
        const p = (await picaProfile(me, id)) || (await (async () => { const a = await accountFor(me, id); return a ? picaProfile(me, a) : null; })());
        return p ? NextResponse.json(p) : bad("Unknown account.");
      }
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
      // ✏️ Reword any comment on your feed — yours or theirs.
      case "comment.edit": {
        if (!UUID.test(id)) return bad("Unknown comment.");
        const c = await picaCommentEdit(me, id, String(b.text || ""));
        return c ? NextResponse.json({ comment: c }) : bad("That comment couldn't be changed.");
      }
      case "comment": {
        if (!UUID.test(id)) return bad("Unknown post.");
        if (!allow(`pica-c:${me}`, [{ ms: 60_000, max: 12 }, { ms: 86_400_000, max: 400 }])) return bad("Slow down a little — try again in a bit.", 429);
        return NextResponse.json({ added: await picaComment(me, id, String(b.text || "")) });
      }
      case "post": {
        if (!allow(`pica-p:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: 30 }])) return bad("That's a lot of posts — try again in a bit.", 429);
        if (String(b.photo || "").trim() && !mediaReady()) return bad("Photos aren't set up yet.");
        return NextResponse.json({ id: await picaPost(me, String(b.caption || ""), String(b.photo || ""), b.useMyPhotos === true, b.drafted === true, String(b.withId || "")) });
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
