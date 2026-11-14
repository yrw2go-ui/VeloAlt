// Run: node --experimental-strip-types tests/vibes.test.ts
import { VIBES, vibeNote, randomAge, rollLesbian, LESBIAN_ODDS, LESBIAN_ASK, AGE_FROM, AGE_TO } from "../app/lib/vibes.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 🎭 The lanes you asked for are all there, plus room either side of them.
for (const want of ["sporty", "model", "edgy", "chill", "professional"]) ok(VIBES.some(v => v.id === want), `there's a ${want} lane`);
ok(VIBES.length >= 10, `and more besides, so they don't cycle (${VIBES.length} lanes)`);
ok(new Set(VIBES.map(v => v.id)).size === VIBES.length, "no lane twice");
ok(VIBES.every(v => v.look.length > 40 && v.life.length > 40), "each one says how she looks AND how she lives");

// 🎲 Ask for twenty and you get a spread, not the same woman.
const notes = Array.from({ length: 60 }, () => vibeNote());
const lanes = new Set(VIBES.filter(v => notes.some(n => n.includes(`(${v.id})`))).map(v => v.id));
ok(lanes.size === VIBES.length, `over sixty goes, every lane comes up (${lanes.size}/${VIBES.length})`);
const first = notes.slice(0, 2);
ok(new Set(notes.slice(0, 12).map(n => (n.match(/\(([a-z]+)\)/) || [])[1])).size >= 5, "and twelve in a row are not all alike");
ok(first.every(n => /She is \d\d years old/.test(n)), "each one has an age of her own");
ok(notes.every(n => /beautiful, but beautiful in HER way/.test(n)), "…all beautiful, none the same beautiful");
ok(notes.every(n => /one thing that cuts against the type/.test(n)), "…and each is asked for something off-type");

// 🎂 18 to 28, nothing outside it.
const ages = Array.from({ length: 400 }, () => randomAge());
ok(Math.min(...ages) >= AGE_FROM && Math.max(...ages) <= AGE_TO, `ages stay between ${AGE_FROM} and ${AGE_TO} (${Math.min(...ages)}–${Math.max(...ages)})`);
ok(new Set(ages).size === AGE_TO - AGE_FROM + 1, "and every age in the range turns up");

// 🚫 A lane already used can be kept out of the next one.
const avoid = VIBES.slice(0, VIBES.length - 1).map(v => v.id);
ok(Array.from({ length: 20 }, () => vibeNote(avoid)).every(n => n.includes(`(${VIBES.at(-1)!.id})`)), "the ones you've just had can be skipped");

// ⚢ Rare: about one woman in seventeen.
ok(Math.abs(LESBIAN_ODDS - 1 / 17) < 1e-9, "one in seventeen is the odds");
const rolls = Array.from({ length: 20000 }, () => rollLesbian()).filter(Boolean).length / 20000;
ok(rolls > 0.045 && rolls < 0.075, `and that's what comes up (${(rolls * 100).toFixed(1)}%, one in ${Math.round(1 / rolls)})`);
// …and when she is, her personality is written twice.
ok(/Write her personality TWICE/.test(LESBIAN_ASK), "when she is, her personality is written twice");
ok(/"personality": who she is at heart/.test(LESBIAN_ASK) && /No mention of who she's attracted to/.test(LESBIAN_ASK), "the plain one says nothing about who she wants");
ok(/nearly the same words/.test(LESBIAN_ASK) && /One or two clauses different, not a different person/.test(LESBIAN_ASK), "the other is the same woman, barely reworded");
ok(/with men \(the user included\) she's friendly, funny and easy but plainly not interested/.test(LESBIAN_ASK), "…differing in how she is with you and other men");
ok(/with women she's the one doing the looking/.test(LESBIAN_ASK), "…and with women");
ok(/her job, her town, her hobbies, her look — is unchanged/.test(LESBIAN_ASK), "nothing else about her changes");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
