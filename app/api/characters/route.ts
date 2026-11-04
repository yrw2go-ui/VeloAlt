import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { scrub } from "../../lib/secrets";
import { MAX_CHARACTERS, DAILY_PORTRAITS, isAdmin, listCharacters, getCharacter, screenCharacter, startPortrait, checkPortrait, deleteCharacter, portraitsReady, chooseVoice, VoiceError } from "../../lib/characters";

// 🎭 Characters. Everyone can list them and chat; only admins create and edit. POST { action, ... }:
//   list                     → { characters, portraits, admin }
//   create / update { id?, name, personality, backstory, relation, appearance, voice } → { character }   (admin)
//   delete { id }            (admin; everyone's chats and memories with it go too)
//   portrait.start { id }    (admin) starts an Atlas Cloud portrait from the appearance
//   portrait.check { id }    (admin) → { status: working | done | failed, character }
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

    if (action === "list") return NextResponse.json({ characters: await listCharacters(), portraits: portraitsReady(), admin });
    if (!admin) return bad("Only an admin can create or change characters.", 403);

    switch (action) {
      case "create":
      case "update": {
        const f = { name: clean(b.name, 60), personality: clean(b.personality, 2000), backstory: clean(b.backstory, 3000), relation: clean(b.relation, 600), appearance: clean(b.appearance, 600) };
        if (!f.name) return bad("Give your character a name.");
        if (!allow(`chars:${me}`, [{ ms: 60_000, max: 10 }, { ms: 86_400_000, max: 200 }])) return bad("That's a lot of changes — try again in a bit.", 429);
        if (action === "update" && !(await getCharacter(id))) return bad("That character wasn't found.");
        if (action === "create") {
          const [{ n }] = await sql()`select count(*)::int as n from chat_characters`;
          if (n >= MAX_CHARACTERS) return bad(`There can be up to ${MAX_CHARACTERS} characters — delete one first.`);
        }
        const problem = await screenCharacter(f);
        if (problem) return bad(problem);
        const prev = action === "update" ? await getCharacter(id) : null;
        // Same voice as before: keep it (no trip to ElevenLabs).
        const v = prev && (b.voice?.id ?? b.voice) === prev.voice ? { id: prev.voice, name: prev.voice_name, kind: prev.voice_kind } : await chooseVoice(b.voice);
        const [row] = action === "create"
          ? await sql()`insert into chat_characters (created_by, name, personality, backstory, relation, appearance, voice, voice_name, voice_kind) values (${me}, ${f.name}, ${f.personality}, ${f.backstory}, ${f.relation}, ${f.appearance}, ${v.id}, ${v.name}, ${v.kind}) returning id`
          : await sql()`update chat_characters set name = ${f.name}, personality = ${f.personality}, backstory = ${f.backstory}, relation = ${f.relation}, appearance = ${f.appearance}, voice = ${v.id}, voice_name = ${v.name}, voice_kind = ${v.kind}, updated_at = now() where id = ${id} returning id`;
        return NextResponse.json({ character: await getCharacter(String(row.id)) });
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
