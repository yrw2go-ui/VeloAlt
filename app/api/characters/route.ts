import { NextRequest, NextResponse } from "next/server";
import { missingSchema, sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { scrub } from "../../lib/secrets";
import { listGallery, mediaByIds } from "../../lib/media";
import { cleanTraits, PRESETS } from "../../lib/traits";
import { isValidTimeZone, localDate } from "../../lib/localTime";
import { availableBrains, brainList } from "../../lib/models";
import { retryChoices } from "../../lib/pickBrain";
import { brainFor } from "../../lib/whichBrain";
import { makeCharacter, usedNames } from "../../lib/makeCharacter";
import { listLinks, setLink, removeLink, writeStory, linkSuggestions, screenStory } from "../../lib/friends";
import { checkCard } from "../../lib/cardCheck";
import { wordsFor } from "../../lib/wordsDb";
import { writeText } from "../../lib/llm";
import { liveHints } from "../../lib/giftsDb";
import { MAX_CHARACTERS, DAILY_PORTRAITS, isAdmin, listCharacters, getCharacter, getCharacterFor, screenCharacter, startPortrait, checkPortrait, deleteCharacter, portraitsReady, chooseVoice, VoiceError } from "../../lib/characters";
import { setHome } from "../../lib/inPerson";
import { localNote } from "../../lib/local";
import { cleanPartner } from "../../lib/attached";
const homeSaid = async (me: string) => { const h = await homeOf(me); return h ? homeText(h) : ""; };
import { picaRenamed } from "../../lib/picagram";
import { homeOf, homeText, livesNote } from "../../lib/where";
import { workNow, inClass } from "../../lib/work";

// 🎭 Characters. Everyone can list them and chat; only admins create and edit. POST { action, ... }:
//   list                     → { characters, portraits, admin }
//   create / update { id?, name, personality, backstory, relation, appearance, job, casualWear, hobbies, voice, romantic, romanceArc, traits, preset, timeZone, referenceIds, brain, workAttire, workDays, workStart, workEnd, partTime, polyOk, sapphic, liveIn } → { character }   (admin)
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

    // 🗂️ One character, everything about her — what the card needs when you open it.
    if (action === "get") {
      const c = await getCharacterFor(me, String(b.id || ""));
      if (!c) return bad("That character wasn't found.");
      return NextResponse.json({ character: c });
    }
    if (action === "list") {
      const list = await listCharacters(me);
      // Newer tables and columns (chat_off, ended_at, at_mine) may not be on this database yet.
      const ids = async (q: () => Promise<{ character_id: unknown }[]>) => {
        try { return (await q()).map(r => String(r.character_id)); }
        catch (e) { if (!missingSchema(e)) throw e; return [] as string[]; }
      };
      // 💼🎓 Where each one is right now, for the chips: at work, in class, or nowhere she's due.
      // Her own day, not the server's: "today" for someone two zones over isn't today here.
      const off = new Set(await (async () => {
        try { return (await sql()`select character_id, day::text as day from chat_off where user_id = ${me} and day >= current_date - 1`).map(r => `${r.character_id}:${r.day}`); }
        catch (e) { if (!missingSchema(e)) throw e; return [] as string[]; }
      })());
      // 🏠 Live-in characters who are in right now (a faint green ring on their chip).
      const home = new Set(await ids(() => sql()`select character_id from chat_in_person where user_id = ${me} and place = 'home' and ended_at is null`));
      // 🔴 Someone who's dropped a hint lately: a red dot by their name until it's dealt with.
      const hinting = await liveHints(me).catch(() => new Map());
      // ⭐ At YOUR place right now: round at yours, or someone who lives with you and is in.
      const atYours = new Set(await ids(() => sql()`select character_id from chat_in_person where user_id = ${me} and at_mine and ended_at is null`));
      // 🧍🎥 Together right now — in person somewhere, or on a video chat: a faint blue ring.
      const with_ = new Set([
        ...await ids(() => sql()`select character_id from chat_in_person where user_id = ${me} and place <> 'home' and ended_at is null`),
        ...await ids(() => sql()`select character_id from chat_scenes where user_id = ${me} and status = 'active' and kind = 'live'`),
      ]);
      const characters = list.map(c => {
        const zone = isValidTimeZone(c.time_zone) ? c.time_zone : "America/Chicago";
        // 🙈 Called off / skipped today: she should be there, and isn't. The ring stays and she gets a 😏.
        const skived = off.has(`${c.id}:${localDate(Date.now(), zone)}`);
        const at = workNow(c, zone, Date.now(), skived, c.id);
        const due = skived ? workNow(c, zone, Date.now(), false, c.id) : at;
        const busy = due.atWork ? (due.kind || (inClass(c) ? "class" : "work")) : null;
        return { ...c, busy, ditched: !!busy && skived, home: c.live_in && home.has(c.id), together: with_.has(c.id), at_yours: atYours.has(c.id), hinting: hinting.has(c.id) };
      });
      // 📋 The chips need a name, a face and a handful of flags. Her personality, backstory,
      // appearance and the rest of the long writing — thousands of characters each, for every
      // character — were going to the phone on every load, and only the card ever shows them.
      // It asks for one character's writing when you open her ("get", below).
      const slim = characters.map(c => {
        const { personality, backstory, appearance, lesbian_personality, romance_arc, casual_wear, hobbies, work_attire, relation, ...rest } = c as Record<string, unknown>;
        void personality; void backstory; void appearance; void lesbian_personality; void romance_arc; void casual_wear; void hobbies; void work_attire; void relation;
        return rest;
      });
      return NextResponse.json({ characters: slim, portraits: portraitsReady(), admin, brains: admin ? availableBrains() : [], brainModels: admin ? brainList() : [] });
    }
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
        if (!allow(`chars:${me}`, [{ ms: 60_000, max: 10 }, { ms: 86_400_000, max: 200 }])) return bad("That's a lot of changes — try again in a bit.", 429);
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
        const klass = {
          school: clean(b.school, 200),
          days: [...new Set((Array.isArray(b.classDays) ? b.classDays : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[],
          start: hhmm(b.classStart), end: hhmm(b.classEnd),
        };
        if (!klass.start || !klass.end) { klass.start = ""; klass.end = ""; }
        const work = { attire: clean(b.workAttire, 400), days: [...new Set((Array.isArray(b.workDays) ? b.workDays : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[], start: hhmm(b.workStart), end: hhmm(b.workEnd), part: b.partTime === true };
        if (!work.start || !work.end) { work.start = ""; work.end = ""; }
        const polyOk = romantic && b.polyOk === true, sapphic = romantic && b.sapphic === true, bigFollowing = b.bigFollowing === true, explicitOk = romantic && b.explicitOk === true;
        const gender = b.gender === "male" ? "male" : "female";
        const liveIn = b.liveIn === true, neighbor = b.neighbor === true, local = b.local === true || neighbor;
        // 📍 Where she lives now, in her own field: nothing has to be guessed from her backstory.
        const livesIn = scrub(String(b.livesIn ?? "").replace(/\s+/g, " ").trim().slice(0, 120));
        const attached = b.attached === "married" ? "married" : b.attached === "dating" ? "dating" : "single";
        const seesOthers = b.seesOthers === true, lesbian = romantic && b.lesbian === true;
        const partner = cleanPartner(b.partner);
        const lesbianPersonality = clean(b.lesbianPersonality, 2000);
        // 🗣️ How she talks: only ever shapes her voice, never who she is.
        const speech = clean(b.speech, 1200);
        const speechOn = b.speechOn !== false;
        // 💞🤫 Official girlfriend, or a relationship kept secret (one or the other, romance only).
        const standing = romantic ? [b.gf === true ? "gf" : "", b.secret === true ? "secret" : ""].filter(Boolean).join("+") : "";
        const zone = typeof b.timeZone === "string" && b.timeZone && isValidTimeZone(b.timeZone) ? b.timeZone : "";
        // Up to 4 reference pictures: finished photos of this character from the admin's gallery.
        const want = (Array.isArray(b.referenceIds) ? b.referenceIds : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 4);
        const refs = action === "update" && want.length
          ? (await sql()`select id from velo_media where id = any(${want}::uuid[]) and user_id = ${me} and character_id = ${id} and kind = 'image' and status = 'done'`).map(r => String(r.id))
          : [];
        const prev = action === "update" ? await getCharacter(id) : null;
        const renamedFrom = prev && prev.name !== f.name ? prev.name : "";
        // Same voice as before: keep it (no trip to ElevenLabs).
        const v = prev && (b.voice?.id ?? b.voice) === prev.voice ? { id: prev.voice, name: prev.voice_name, kind: prev.voice_kind } : await chooseVoice(b.voice);
        const [row] = action === "create"
          ? await sql()`insert into chat_characters (created_by, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic, live_in, neighbor, local, attached, sees_others, lesbian, lesbian_personality, partner, big_following, standing, school, class_days, class_start, class_end, lives_in, speech, speech_on, home_attire, explicit_ok, gender) values (${me}, ${f.name}, ${f.personality}, ${f.backstory}, ${f.relation}, ${f.appearance}, ${f.job}, ${f.casual_wear}, ${f.hobbies}, ${v.id}, ${v.name}, ${v.kind}, ${romantic}, ${arc}, ${JSON.stringify(traits)}::jsonb, ${presetId}, ${zone}, ${bday}, ${brain}, ${work.attire}, ${work.days}::int[], ${work.start}, ${work.end}, ${work.part}, ${polyOk}, ${sapphic}, ${liveIn}, ${neighbor}, ${local}, ${attached}, ${seesOthers}, ${lesbian}, ${lesbianPersonality}, ${partner}, ${bigFollowing}, ${standing}, ${klass.school}, ${klass.days}::int[], ${klass.start}, ${klass.end}, ${livesIn}, ${speech}, ${speechOn}, ${f.home_attire}, ${explicitOk}, ${gender}) returning id`
          : await sql()`update chat_characters set name = ${f.name}, personality = ${f.personality}, backstory = ${f.backstory}, relation = ${f.relation}, appearance = ${f.appearance}, job = ${f.job}, casual_wear = ${f.casual_wear}, hobbies = ${f.hobbies}, voice = ${v.id}, voice_name = ${v.name}, voice_kind = ${v.kind}, romantic = ${romantic}, romance_arc = ${arc}, traits = ${JSON.stringify(traits)}::jsonb, preset = ${presetId}, time_zone = ${zone}, birthday = ${bday}, brain = ${brain}, work_attire = ${work.attire}, work_days = ${work.days}::int[], work_start = ${work.start}, work_end = ${work.end}, part_time = ${work.part}, poly_ok = ${polyOk}, sapphic = ${sapphic}, live_in = ${liveIn}, neighbor = ${neighbor}, local = ${local}, attached = ${attached}, sees_others = ${seesOthers}, lesbian = ${lesbian}, lesbian_personality = ${lesbianPersonality}, partner = ${partner}, big_following = ${bigFollowing}, standing = ${standing}, school = ${klass.school}, class_days = ${klass.days}::int[], class_start = ${klass.start}, class_end = ${klass.end}, lives_in = ${livesIn}, speech = ${speech}, speech_on = ${speechOn}, home_attire = ${f.home_attire}, explicit_ok = ${explicitOk}, gender = ${gender}, reference_ids = ${want.filter((x: string) => refs.includes(x))}::uuid[], updated_at = now() where id = ${id} returning id`;
        // 💍 Her own relationship: starting one sets the clock, ending one clears it.
        if (attached !== (prev?.attached || "single")) {
          if (attached === "single") await sql()`update chat_characters set attached_since = null, attached_until = null, partner = '' where id = ${row.id}`;
          else await sql()`update chat_characters set attached_since = coalesce(attached_since, current_date), attached_until = ${attached === "dating" ? new Date(Date.now() + (14 + Math.floor(Math.random() * 90)) * 86_400_000).toISOString().slice(0, 10) : null} where id = ${row.id}`;
        }
        // 🏠 Just moved in: she's home to start with. Moved out: she isn't in the house any more.
        if (liveIn !== !!prev?.live_in) await setHome(me, String(row.id), liveIn).catch(e => console.error("characters: live-in", e instanceof Error ? e.message : e));
        // 📍 Moved: her Picagram profile says where she lives now too.
        if (livesIn !== (prev?.lives_in || "")) await sql()`update pica_accounts set lives = ${livesIn || null} where user_id = ${me} and character_id = ${row.id}`
          .catch(e => console.error("characters: pica lives", e instanceof Error ? e.message : e));
        // ✍️ Renamed: her Picagram account and everyone's memories of her follow the new name.
        if (renamedFrom) await picaRenamed(me, id, renamedFrom, f.name).catch(e => console.error("characters: rename", e instanceof Error ? e.message : e));
        return NextResponse.json({ character: await getCharacter(String(row.id)) });
      }

      // 📄 A copy of a character under a new name: everything except her pictures (portrait, references, gallery).
      // 🛡️ A look over the card, when you ask: where she lives, her job, and the ticks against
      // her own words. It saves nothing and stops nothing.
      case "screen": {
        if (!allow(`screen:${me}`, [{ ms: 60_000, max: 10 }, { ms: 86_400_000, max: 200 }])) return bad("That's a lot of checks — try again in a bit.", 429);
        const home = await homeOf(me).catch(() => null);
        const num = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6) : []);
        const findings = await checkCard({
          name: clean(b.name, 60), personality: clean(b.personality, 2000), backstory: clean(b.backstory, 3000),
          relation: clean(b.relation, 600), appearance: clean(b.appearance, 600), job: clean(b.job, 300),
          casualWear: clean(b.casualWear, 400), hobbies: clean(b.hobbies, 600), workAttire: clean(b.workAttire, 400),
          romanceArc: clean(b.romanceArc, 2000), workDays: num(b.workDays), workStart: clean(b.workStart, 5), workEnd: clean(b.workEnd, 5),
          partTime: b.partTime === true, school: clean(b.school, 200), classDays: num(b.classDays), classStart: clean(b.classStart, 5), classEnd: clean(b.classEnd, 5),
          romantic: b.romantic === true, liveIn: b.liveIn === true, neighbor: b.neighbor === true, local: b.local === true,
          livesIn: clean(b.livesIn, 120),
          attached: clean(b.attached, 20) || "single", partner: clean(b.partner, 80), seesOthers: b.seesOthers === true,
          lesbian: b.lesbian === true, bigFollowing: b.bigFollowing === true, gf: b.gf === true, secret: b.secret === true,
          polyOk: b.polyOk === true, sapphic: b.sapphic === true, timeZone: clean(b.timeZone, 60),
          man: clean(b.gender, 10) === "male",
        }, home ? homeText(home) : "");
        return NextResponse.json({ findings });
      }
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
        const [row] = await sql()`insert into chat_characters (created_by, owner_id, intro_status, name, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic, live_in, neighbor, local, attached, sees_others, lesbian, lesbian_personality, partner, big_following, standing, school, class_days, class_start, class_end, lives_in, home_attire, explicit_ok, gender)
          select ${me}, owner_id, intro_status, ${name}, personality, backstory, relation, appearance, job, casual_wear, hobbies, voice, voice_name, voice_kind, romantic, romance_arc, traits, preset, time_zone, birthday, brain, work_attire, work_days, work_start, work_end, part_time, poly_ok, sapphic, live_in, neighbor, local, attached, sees_others, lesbian, lesbian_personality, partner, big_following, standing, school, class_days, class_start, class_end, lives_in, home_attire, explicit_ok, gender
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
        // 🙅 Not another one of the same name: everyone they already have is off the table.
        const taken = await usedNames(me).catch(() => []);
        // 🧠 Whoever you picked in the popup, or the brain from Settings as before.
        const picked = b.brain === "claude" || availableBrains().includes(b.brain) ? String(b.brain) : "";
        try { return NextResponse.json({ draft: { local: b.local === true, ...await makeCharacter({ userId: me, name: String(b.name || ""), vibe: String(b.vibe || ""), job: String(b.job || ""), romantic: b.romantic === true, male: b.male === true, liveIn: b.liveIn === true, local: b.local === true, avoidNames: taken, words: await wordsFor(me), brain: picked || undefined, lives: b.local === true ? localNote(await homeSaid(me)) : livesNote(await homeOf(me)) }) } }); }
        // 🧠 One brain couldn't manage her: say who, and offer the others to try instead — the same
        // second chance a new face on Picagram gets, rather than a dead end saying "try again".
        catch (e) {
          const tried = picked || (await brainFor(me))[0] || "claude";
          return NextResponse.json({ draft: null, why: e instanceof Error ? e.message : "Couldn't come up with one.", tried, retry: retryChoices(tried, availableBrains()) });
        }
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
        const mine = (await listGallery(me, id, null, 60)).filter(x => x.kind === "image");
        // 🖼️ Pictures already picked as hers come too, even when they're not in this list (an
        // older one, or one from her Picagram days) — so what's picked is always on screen.
        const want = (Array.isArray(b.ids) ? b.ids.map(String) : []).filter((x: string) => !mine.some(m => m.id === x));
        const extra = want.length ? (await mediaByIds(me, want)).filter(x => x.kind === "image") : [];
        return NextResponse.json({ items: [...extra, ...mine] });
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
        // 🛡️ Checked as what it is — a note about the two of them, not a character card.
        const no = story ? await screenStory(a.name, o.name, kind, story, !!(a.romantic && o.romantic)).catch(() => null) : null;
        if (no) return bad(no);
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
      // 🗣️ "Learn from chat": read her own messages back and write down the habits of her voice.
      // It only ever proposes — nothing is saved until they keep it.
      case "speech.learn": {
        const ch = await getCharacterFor(me, id);
        if (!ch) return bad("That character wasn't found.");
        if (!allow(`speech:${me}`, [{ ms: 60_000, max: 4 }, { ms: 86_400_000, max: 60 }])) return bad("That's the limit for now — try again in a minute.", 429);
        // Only the messages they rewrote themselves: those edits are the examples of how she should
        // sound. Everything she wrote herself is what they were correcting, so it's left out.
        const rows = await sql()`select content from velo_messages where user_id = ${me} and character_id = ${id}
          and role = 'assistant' and edited and media_id is null and not peek order by created_at desc limit 40`;
        const said = rows.map(r => String(r.content || "").trim()).filter(x => x.length > 1).reverse();
        if (said.length < 2) return bad(`Rewrite a few of ${ch.name}'s messages first — double-tap one of ${ch.voice_kind === "male" ? "his" : "her"} bubbles to put it in your own words, and this reads those back.`);
        const text = await writeText(await brainFor(me),
          `You are given messages from a chat that the reader REWROTE BY HAND, to make the character sound the way they want her to sound. They are the examples to follow. Write down the HABITS OF HER VOICE and nothing else: the shape and sound of how she writes.
Only what you can actually see in these messages. Say it in 2-5 short lines, each a plain habit, like notes someone jotted down:
- how long her messages are, and whether she sends one or several
- capitals, punctuation, how she ends a sentence, whether she trails off
- words and phrases she actually reaches for (quote the real ones)
- emoji: which, how often, or none
- anything she clearly never does
Never describe her personality, mood, feelings, opinions, who she is or what she talks about. No praise, no analysis, no preamble, no headings. Just the lines.`,
          `MESSAGES OF ${ch.name.toUpperCase()}'S, REWRITTEN BY HAND:\n${said.map(x => `- ${x.slice(0, 300)}`).join("\n").slice(0, 12000)}`, 500).catch(() => "");
        const speech = scrub(text).replace(/\r/g, "").trim().slice(0, 1200);
        if (!speech) return bad("Couldn't work that out — try again.");
        return NextResponse.json({ speech });
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
