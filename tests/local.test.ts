// Run: node --experimental-strip-types tests/local.test.ts
import { localConflict, localNote, NEAR_SOUTH_HOLLAND } from "../app/lib/local.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 🚩 A card that puts her somewhere she couldn't drive from.
const away: [string, string][] = [
  ["She grew up in Austin, Texas and still lives there.", "Texas"],
  ["Born and raised in Brooklyn, NY — never left.", "New York"],
  ["She moved to Indianapolis for the job.", "Indianapolis"],
  ["Lives in Springfield, teaches third grade.", "Springfield"],
  ["A flat in London, two cats.", "London"],
  ["Up in Milwaukee, Wisconsin, works at a brewery.", "Wisconsin"],
];
for (const [text, where] of away) ok(localConflict(text) === where, `"${text.slice(0, 34)}…" → flagged as ${where} (got ${localConflict(text) || "nothing"})`);

// ✅ Somewhere she really could be.
const fine = [
  "She rents a place in Munster, Indiana with her sister.",
  "Grew up in Lansing, works nights at a diner in Calumet City.",
  "Teaches at a school in Tinley Park; lives in Oak Forest.",
  "A condo in Hyde Park, Chicago, and a long commute.",
  "Valparaiso — she likes being out past the dunes.",
  "",
];
for (const t of fine) if (localConflict(t)) { ok(false, `"${t}" was flagged (${localConflict(t)}) and shouldn't be`); break; }
ok(true, "a nearby town, or nothing said at all, is never flagged");
// A nearby town wins even when somewhere far is mentioned in passing.
ok(!localConflict("She's from Texas originally, but she's lived in Dolton since college."), "where she lives now beats where she's from");

// 🏙️ What the writer is told.
const note = localNote("South Holland, IL");
ok(/within about an hour's drive of South Holland, IL/.test(note), "the note names your hometown");
ok(/north-west Indiana/.test(note) && /south(-| )?(and southwest )?suburbs|southwest suburbs/.test(note), "…and the area around it");
ok(/Vary it/.test(note), "…and asks for variety, not the same town every time");
const picks = new Set<string>();
for (let i = 0; i < 40; i++) for (const t of NEAR_SOUTH_HOLLAND) if (localNote("x").includes(t)) picks.add(t);
ok(picks.size > 20, `it offers a wide spread of real towns (${picks.size} of ${NEAR_SOUTH_HOLLAND.length})`);
ok(NEAR_SOUTH_HOLLAND.every(t => /, (IL|IN)$/.test(t)), "every one of them is in Illinois or Indiana");
ok(NEAR_SOUTH_HOLLAND.every(t => !localConflict(t.split(",")[0])), "…and none of them would trip the warning");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
