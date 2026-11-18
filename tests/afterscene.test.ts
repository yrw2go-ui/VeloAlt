// Run: node --experimental-strip-types tests/afterscene.test.ts
import { afterSceneNote, nightsBetween, stayedUpAllNight } from "../app/lib/afterScene.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const note = (nights: number, allNighter = false) => afterSceneNote({ what: "video chat", title: "Video Chat", nights, allNighter });

// 📅 How many nights sit between the day it started and the day it was ended.
ok(nightsBetween("2026-11-17", "2026-11-18") === 1, "started last night, ended this morning: one night");
ok(nightsBetween("2026-11-18", "2026-11-18") === 0, "started and ended the same day: none");
ok(nightsBetween("2026-11-15", "2026-11-18") === 3, "left running for days: three");
ok(nightsBetween("", "2026-11-18") === 0, "a missing date is treated as none, never a negative");

// 🌙 Ended the next morning: it was last night, and they both slept.
const overnight = note(1);
ok(/last night/.test(overnight), "she's told the video chat was last night");
ok(/new day/.test(overnight) && /went to bed and slept/.test(overnight), "…that it's a new day and they both slept");
ok(/not as something that's still going on/.test(overnight), "…and not to carry straight on from the middle of it");
ok(/bringing it up/.test(overnight), "…while she can still bring it up and tease about it");
ok(/yesterday evening/.test(overnight), "one night back reads as yesterday evening");

// Several days later it says how many.
ok(/3 nights ago/.test(note(3)) && !/yesterday evening/.test(note(3)), "three nights back says three nights ago");

// ☀️ Same day: nothing at all is said — it just happened.
ok(note(0) === "", "ended the same day, she's told nothing");

// 🌅 Unless they were up the whole night.
const up = note(1, true);
ok(/never went to bed/.test(up) && /no sleep at all/.test(up), "up all night: no sleep, and she knows it");
ok(!/went to bed and slept/.test(up), "…and she's never told they slept");
ok(/new day/.test(up), "…but it's still a new day");

// What counts as saying you stayed up.
for (const s of ["let's pull an all-nighter", "we stayed up all night", "I never went to bed", "still awake?", "let's watch the sunrise together", "honestly I haven't slept"])
  ok(stayedUpAllNight(s), `"${s}" means they were up all night`);
for (const s of ["night, talk tomorrow?", "I'm going to bed", "that was fun, sleep well", "I slept all night", "see you in the morning"])
  ok(!stayedUpAllNight(s), `"${s}" doesn't`);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
