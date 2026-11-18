// 📷 No two of her photos should look like the same picture.
import { SHOTS, TONES, shotFor, toneFor } from "../app/lib/shots.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// A day of her posts moves around the angles.
const day = Array.from({ length: 6 }, (_, i) => shotFor("hailey:2026-11-15", i));
ok(new Set(day).size >= 4, `six posts in a day use at least four different shots (${new Set(day).size})`);
ok(day.every(s => SHOTS.includes(s)), "every one is a real shot");
ok(!day.some((s, i) => i > 0 && s === day[i - 1]), "…and the same one never comes round twice in a row");

// Everyone has some. The ones that way inclined have more.
const tones = (sugg: number) => Array.from({ length: 12 }, (_, i) => toneFor("hailey", i, sugg, true));
const sensual = (sugg: number) => tones(sugg).filter(t => t === "sensual").length;
ok(sensual(0) >= 1, `even the most buttoned-up posts some (${sensual(0)} in 12)`);
ok(sensual(8) > sensual(0), `and one who's that way inclined posts more (${sensual(8)} vs ${sensual(0)} in 12)`);
ok(tones(0).includes("everyday") && tones(0).includes("flattering"), "the rest are a mix of everyday and flattering");

// Family-friendly characters never get the sensual one.
ok(!Array.from({ length: 12 }, (_, i) => toneFor("pat", i, 9, false)).includes("sensual"), "a family-friendly one never does");
ok(Array.from({ length: 12 }, (_, i) => toneFor("pat", i, 9, false)).includes("flattering"), "…she gets a flattering one instead");
ok(Object.keys(TONES).length === 3, "three tones in all");

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
