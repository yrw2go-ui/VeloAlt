import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { scrub } from "../../lib/secrets";
import { MAX_CHARACTERS, DAILY_PORTRAITS, listCharacters, ownCharacter, screenCharacter, startPortrait, checkPortrait, deleteCharacter, portraitsReady } from "../../lib/characters";

// 🎭 Characters. POST { action, ... }:
//   list                              → { characters, portraits }
//   create { name, about, appearance } → { character }   (checked first)
//   update { id, name, about, appearance }
//   delete { id }                     (its chat and portrait go too)
//   portrait.start { id }             → starts an Atlas Cloud portrait from the appearance
//   portrait.check { id }             → { status: working | done | failed, character }
const clean = (v: unknown, n: number) => scrub(String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n));
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return bad("Please sign in again.", 401);
    const b = await req.json().catch(() => ({}));
    const me = c.userId, id = String(b.id || "");

    switch (String(b.action || "")) {
      case "list":
        return NextResponse.json({ characters: await listCharacters(me), portraits: portraitsReady() });

      case "create":
      case "update": {
        const name = clean(b.name, 60), about = clean(b.about, 1500), appearance = clean(b.appearance, 600);
        if (!name) return bad("Give your character a name.");
        if (!allow(`chars:${me}`, [{ ms: 60_000, max: 6 }, { ms: 86_400_000, max: 60 }])) return bad("That's a lot of changes — try again in a bit.", 429);
        const existing = b.action === "update" ? await ownCharacter(me, id) : null;
        if (b.action === "update" && !existing) return bad("That character wasn't found.");
        if (b.action === "create") {
          const [{ n }] = await sql()`select count(*)::int as n from chat_characters where user_id = ${me}`;
          if (n >= MAX_CHARACTERS) return bad(`You can have up to ${MAX_CHARACTERS} characters — delete one first.`);
        }
        const problem = await screenCharacter(name, about, appearance);
        if (problem) return bad(problem);
        const [row] = b.action === "create"
          ? await sql()`insert into chat_characters (user_id, name, about, appearance) values (${me}, ${name}, ${about}, ${appearance}) returning id`
          : await sql()`update chat_characters set name = ${name}, about = ${about}, appearance = ${appearance}, updated_at = now() where id = ${id} and user_id = ${me} returning id`;
        return NextResponse.json({ character: await ownCharacter(me, String(row.id)) });
      }

      case "delete":
        return (await deleteCharacter(me, id)) ? NextResponse.json({ ok: true }) : bad("That character wasn't found.");

      case "portrait.start": {
        if (!portraitsReady()) return bad("Portraits aren't set up yet.", 503);
        const ch = await ownCharacter(me, id);
        if (!ch) return bad("That character wasn't found.");
        if (!ch.appearance) return bad("Describe what they look like first.");
        if (ch.portrait_job) return NextResponse.json({ status: "working" });
        if (!allow(`portrait:${me}`, [{ ms: 60_000, max: 3 }, { ms: 86_400_000, max: DAILY_PORTRAITS }])) return bad(`That's the limit for portraits for now (${DAILY_PORTRAITS} a day).`, 429);
        const job = await startPortrait(ch.name, ch.appearance);
        await sql()`update chat_characters set portrait_job = ${job} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ status: "working" });
      }
      case "portrait.check": {
        const ch = await ownCharacter(me, id);
        if (!ch) return bad("That character wasn't found.");
        const status = await checkPortrait(me, ch);
        return NextResponse.json({ status, character: await ownCharacter(me, id) });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("characters", e instanceof Error ? e.message : e);
    return bad(e instanceof Error && /picture service/.test(e.message) ? e.message : "Something went wrong. Please try again.", 500);
  }
}
