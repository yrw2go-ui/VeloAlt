import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { scrub } from "../../lib/secrets";
import { listGallery } from "../../lib/media";
import { cleanTraits, PRESETS } from "../../lib/traits";
import { isValidTimeZone } from "../../lib/localTime";
import { availableBrains, brainList } from "../../lib/models";
import { makeCharacter } from "../../lib/makeCharacter";
import { listLinks, setLink, removeLink, writeStory, linkSuggestions } from "../../lib/friends";
import { MAX_CHARACTERS, DAILY_PORTRAITS, isAdmin, listCharacters, getCharacter, screenCharacter, startPortrait, checkPortrait, deleteCharacter, portraitsReady, chooseVoice, VoiceError } from "../../lib/characters";

// 🎭 Characters. Everyone can list them and chat; only admins create and edit. POST { action, ... }:
//   list                     → { characters, portraits, admin }
//   create / update { id?, name, personality, backstory, relation, appearance, job, casualWear, hobbies, voice, romantic, romanceArc, traits, preset, timeZone, referenceIds, brain, workAttire, workDays, workStart, workEnd, partTime, polyOk, sapphic } → { character }   (admin)
//   duplicate { id, name } → { character }   (admin) 📄 a copy under a new name, without her pictures
//   brain.set { id, brain: '' | qwen | deepseek } → { character }   (admin) 🧠 from Settings → Brains
//   generate { name?, vibe?, job?, romantic?, male? } → { draft }   (admin) ✨ a new character to look over in the editor
//   gallery { id } → { items }   the admin's pictures of this character, to pick references from
//   delete { id }            (admin; everyone's chats and memories with it go too)
//   portrait.start { id }    (admin) starts an Atlas Cloud portrait from the appearance
//   portrait.check { id }    (admin) → { status: working | done | failed, character }
//   links { id } → { links, knownBy }; link.set { id, otherId, kind, story? }; link.remove { id, otherId }   (admin) 👭 friends & family — one way: id knows otherId
//   link.draft { id, otherId, kind } → { story }   (admin) a written "how they know each other" to edit before linking
//   link.suggest { id, text } → { suggest }  (admin; others get []) someone they mentioned to her who knows her, but she doesn't know back
const clean = (v: unknown, n: number) => scrub(String(v ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n));
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return bad("Please sign in again.", 401);
    const b = await req.json().catch(() => ({}));
    const me = c.userId, id = String(b.id || "");
    const action = String(b.action || "");
    const admin = await isAdmin(me);

    if (action === "list") return NextResponse.json({ characters: await listCharacters(me), portraits: portraitsReady(), admin, brains: admin ? availableBrains() : [], brainModels: admin ? brainList() : [] });
    if (action === "link.suggest") {
      const ch = admin ? await getCharacter(id) : null;
      return NextResponse.json({ suggest: ch ? await linkSuggestions(ch, clean(b.text, 2000), me).catch(() => []) : [] });
    }
    if (!admin) return bad("Only an admin can create or change characters.", 403);

    switch (action) {
      case "create":
      case "update": {
        const f = { name: clean(b.name, 60), personality: clean(b.personality, 2000), backstory: clean(b.backstory, 3000), relation: clean(b.relation, 600), appearance: clean(b.appearance, 600), job: clean(b.job, 300), casual_wear: clean(b.casualWear, 400), hobbies: clean(b.hobbies, 600), home_attire: clean(b.homeAttire, 400) };
        if (!f.name) return bad("Give your character a name.");
        if (!allow(`chars:${me}`, [{ ms: 60_000, max: 50 }, { ms: 86_400_000, max: 200 }])) return bad("That's a lot of changes — try again in a bit.", 429);
        if (action === "update" && !(await getCharacter(id))) return bad("That character wasn't found.");
        if (action === "create") {
          const [{ n }] = await sql()`select count(*)::int as n from chat_characters where owner_id is null`;
          if (n >= MAX_CHARACTERS) return bad(`There can be up to ${MAX_CHARACTERS} characters — delete one first.`);
        }
        const romantic = b.romantic === true;
        const arc = romantic ? clean(b.romanceArc, 1500) : "";
        const traits = cleanTraits(b.traits);
        const presetId = PRESETS.some(p => p.id === b.preset) ? String(b.preset) : "";
        const bday = typeof b.birthday === "string" && /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(b.birthday) ? b.birthday : "";
        // 🧠 Her own brain (Qwen / DeepSeek through Atlas Cloud), only if it's set up here.
        const brain = b.brain === "claude" || availableBrains().includes(b.brain) ? String(b.brain) : "";
        // 💼 Her work week, and 💞🌈 romance options (only with romance on).
        const hhmm = (v: unknown) => (typeof v === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v) ? v : "");
        const work = { attire: clean(b.workAttire, 400), days: [...new Set((Array.isArray(b.workDays) ? b.workDays : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[], start: hhmm(b.workStart), end: hhmm(b.workEnd), part: b.partTime === true };
        if (!work.start || !work.end) { work.start = ""; work.end = ""; }
        const polyOk = romantic && b.polyOk === true, sapphic = romantic && b.sapphic === true, explicitOk = romantic && b.explicitOk === true;
        const zone = typeof b.timeZone === "string" && b.timeZone && isValidTimeZone(b.timeZone) ? b.timeZone : "";
        // Up to 4 reference pictures: finished photos of this character from the admin's gallery.
        const want = (Array.isArray(b.referenceIds) ? b.referenceIds : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 4);
        const refs = action === "update" && want.length
          ? (await sql()`select id from velo_media where id = any(${want}::uuid[]) and user_id = ${me} and character_id = ${id} and kind = 'image' and status = 'done'`).map(r => String(r.id))
          : [];
        const problem = await screenCharacter({ ...f, casual_wear: work.attire ? `${f.casual_wear} / at work: ${work.attire}` : f.casual_wear, arc, romantic });
        if (problem) return bad(problem);
        const prev = action === "update" ? await getCharacter(id) : null;
        // Same voice as before: keep it (no trip to ElevenLabs).
        const v = prev && (b.voice?.id ?? b.voice) === prev.voice ? { id: prev.voice, name: prev.voice_name, kind: prev.voice_kind } : await chooseVoice(b.voice);
        const db = sql();
        const [row] = action === "create"
          ? await db`insert into chat_characters (created_by, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic, home_attire, explicit_ok) values (${me}, ${f.name}, ${f.personality}, ${f.backstory}, ${f.relation}, ${f.appearance}, ${f.job}, ${f.casual_wear}, ${f.hobbies}, ${v.id}, ${v.name}, ${v.kind}, ${romantic}, ${arc}, ${db.json(traits)}, ${presetId}, ${zone}, ${bday}, ${brain}, ${work.attire}, ${work.days}::int[], ${work.start}, ${work.end}, ${work.part}, ${polyOk}, ${sapphic}, ${f.home_attire}, ${explicitOk}) returning id`
          : await db`update chat_characters set name = ${f.name}, personality = ${f.personality}, backstory = ${f.backstory}, relation = ${f.relation}, appearance = ${f.appearance}, job = ${f.job}, casual_wear = ${f.casual_wear}, hobbies = ${f.hobbies}, voice = ${v.id}, voice_name = ${v.name}, voice_kind = ${v.kind}, romantic = ${romantic}, romance_arc = ${arc}, traits = ${db.json(traits)}, preset = ${presetId}, time_zone = ${zone}, birthday = ${bday}, brain = ${brain}, work_attire = ${work.attire}, work_days = ${work.days}::int[], work_start = ${work.start}, work_end = ${work.end}, part_time = ${work.part}, poly_ok = ${polyOk}, sapphic = ${sapphic}, explicit_ok = ${explicitOk}, home_attire = ${f.home_attire}, reference_ids = ${want.filter((x: string) => refs.includes(x))}::uuid[], updated_at = now() where id = ${id} returning id`;
        return NextResponse.json({ character: await getCharacter(String(row.id)) });
      }

      // 📄 A copy of a character under a new name: everything except her pictures (portrait, references, gallery).
      case "duplicate": {
        const src = await getCharacter(id);
        if (!src || (src.owner_id && src.owner_id !== me)) return bad("That character wasn't found.");
        const name = clean(b.name, 60).replace(/\n/g, " ");
        if (!name) return bad("Give the copy a name.");
        const [dupe] = await sql()`select 1 from chat_characters where lower(name) = lower(${name}) and (owner_id is null or owner_id = ${me}) limit 1`;
        if (dupe) return bad(`There's already a character named ${name}.`);
        if (!src.owner_id) {
          const [{ n }] = await sql()`select count(*)::int as n from chat_characters where owner_id is null`;
          if (n >= MAX_CHARACTERS) return bad(`There can be up to ${MAX_CHARACTERS} characters — delete one first.`);
        }
        const [row] = await sql()`insert into chat_characters (created_by, owner_id, intro_status, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic, home_attire)
          select ${me}, owner_id, intro_status, ${name}, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic
          from chat_characters where id = ${id} returning id`;
        return NextResponse.json({ character: await getCharacter(String(row.id)) });
      }
      // 🧠 Just her brain (from Settings → Brains): '' = same as Velo's, or qwen / deepseek through Atlas.
      case "brain.set": {
        if (!(await getCharacter(id))) return bad("That character wasn't found.");
        const brain = b.brain === "" || b.brain === "claude" ? String(b.brain) : availableBrains().includes(b.brain) ? String(b.brain) : null;
        if (brain === null) return bad("That brain isn't set up yet.");
        await sql()`update chat_characters set brain = ${brain}, updated_at = now() where id = ${id}`;
        return NextResponse.json({ character: await getCharacter(id) });
      }
      // ✨ A whole new character from a few hints — only a draft for the editor (nothing is saved).
      case "generate": {
        if (!allow(`chargen:${me}`, [{ ms: 60_000, max: 6 }, { ms: 86_400_000, max: 100 }])) return bad("That's a lot of new characters — give it a minute.", 429);
        try { return NextResponse.json({ draft: await makeCharacter({ name: String(b.name || ""), vibe: String(b.vibe || ""), job: String(b.job || ""), romantic: b.romantic === true, male: b.male === true }) }); }
        catch (e) { return bad(e instanceof Error ? e.message : "Couldn't come up with one — try again.", 502); }
      }
      // Make one of her gallery pictures the main headshot.
      case "portrait.set": {
        const mid = String(b.mediaId || "");
        if (!/^[0-9a-f-]{36}$/i.test(mid) || !(await getCharacter(id))) return bad("That picture wasn't found.");
        const [m] = await sql()`select file_id from velo_media where id = ${mid} and user_id = ${me} and character_id = ${id} and kind = 'image' and status = 'done'`;
        if (!m?.file_id) return bad("That picture wasn't found.");
        await sql()`update chat_characters set portrait_file_id = ${m.file_id}, updated_at = now() where id = ${id}`;
        return NextResponse.json({ character: await getCharacter(id) });
      }
      case "gallery": {
        if (!(await getCharacter(id))) return bad("That character wasn't found.");
        return NextResponse.json({ items: (await listGallery(me, id, null, 60)).filter(x => x.kind === "image") });
      }

      // 👭 Friends & family between characters.
      case "links": {
        if (!(await getCharacter(id))) return bad("That character wasn't found.");
        return NextResponse.json(await listLinks(id));
      }
      case "link.set": {
        const other = String(b.otherId || "");
        const [a, o] = [await getCharacter(id), other !== id ? await getCharacter(other) : null];
        if (!a || !o) return bad("Pick another character.");
        const kind = clean(b.kind, 60).replace(/\n/g, " ") || "friends";
        let story = clean(b.story, 600);
        // Linking back: their shared history is already written from the other side.
        if (!story) story = String((await sql()`select story from chat_character_links where knower_id = ${other} and known_id = ${id}`)[0]?.story || "");
        if (!story) story = await writeStory(a, o, kind);
        if (story && (await screenCharacter({ name: `${a.name} & ${o.name}`, personality: "", backstory: story, relation: "", appearance: "" }))) return bad("That story isn't allowed — try different wording.");
        await setLink(id, other, kind, story);
        return NextResponse.json(await listLinks(id));
      }
      // ✍️ A draft of how they know each other, to check and edit before linking.
      case "link.draft": {
        const other = String(b.otherId || "");
        const [a, o] = [await getCharacter(id), other !== id ? await getCharacter(other) : null];
        if (!a || !o) return bad("Pick another character.");
        return NextResponse.json({ story: await writeStory(a, o, clean(b.kind, 60).replace(/\n/g, " ") || "friends") });
      }
      case "link.remove": {
        await removeLink(id, String(b.otherId || ""));
        return NextResponse.json(await listLinks(id));
      }

      case "delete":
        return (await deleteCharacter(id)) ? NextResponse.json({ ok: true }) : bad("That character wasn't found.");

      case "portrait.start": {
        if (!portraitsReady()) return bad("Portraits aren't set up yet.", 503);
        const ch = await getCharacter(id);
        if (!ch) return bad("That character wasn't found.");
        if (!ch.appearance) return bad("Describe what they look like first.");
        if (ch.portrait_job) return NextResponse.json({ status: "working" });
        if (!allow(`portrait:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: DAILY_PORTRAITS }])) return bad(`That's the limit for portraits for now (${DAILY_PORTRAITS} a day).`, 429);
        const job = await startPortrait(ch.name, ch.appearance);
        await sql()`update chat_characters set portrait_job = ${job} where id = ${id}`;
        return NextResponse.json({ status: "working" });
      }
      case "portrait.check": {
        const ch = await getCharacter(id);
        if (!ch) return bad("That character wasn't found.");
        const status = await checkPortrait(me, ch);
        return NextResponse.json({ status, character: await getCharacter(id) });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof VoiceError) return bad(e.message);
    console.error("characters", e instanceof Error ? e.message : e);
    return bad(e instanceof Error && /picture service/.test(e.message) ? e.message : "Something went wrong. Please try again.", 500);
  }
}
