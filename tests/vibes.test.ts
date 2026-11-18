// Run: node --experimental-strip-types tests/vibes.test.ts
import { clearName, VIBES, vibeNote, randomAge, rollLesbian, FIRST_NAMES, LAST_NAMES, LESBIAN_ODDS, LESBIAN_ASK, AGE_FROM, AGE_TO } from "../app/lib/vibes.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 👩 Every life you asked for is there.
const wanted = ["swimsuit-model", "bookworm", "cosplayer", "musician", "trainer", "waitress", "bartender",
  "hygienist", "attorney-rich", "trust-fund", "programmer", "stylist", "scientist", "professor", "cheerleader",
  "volleyball-coach", "streamer", "chef", "driver", "hostess", "car-sales", "candy-shop", "freshman",
  "barista", "server", "nun", "aquarium", "police", "art-teacher", "gymnast", "author", "mechanic"];
for (const want of wanted) if (!VIBES.some(v => v.id === want)) { ok(false, `${want} is missing`); break; }
ok(true, `all ${wanted.length} of the lives you listed are there`);
ok(VIBES.length >= 30, `plus more besides, so they don't cycle (${VIBES.length})`);
ok(new Set(VIBES.map(v => v.id)).size === VIBES.length, "none of them twice");
ok(VIBES.every(v => v.look.length > 40 && v.life.length > 60), "each one says what she does all day AND how that makes her look");
// The named places you gave come through by name.
const places = ["Honchos Steakhouse", "Redfield Parcel", "GloClub", "Gilbert's Auto Sales", "Coco's Candy Shop", "South Holland Community College", "Cowgirls Espresso", "Tilted Kilt", "SHED Aquarium", "Chicago Gators", "HomeBuy Realty", "South Holland police", "Tinley Park high-school art teacher", "Morton High School"];
for (const p of places) if (!VIBES.some(v => `${v.label} ${v.life} ${v.look}`.includes(p))) { ok(false, `${p} is missing`); break; }
ok(true, "and the places you named are named");

// 🎲 Ask for twenty and you get a spread, not the same woman.
const notes = Array.from({ length: 60 }, () => vibeNote());
const notes2 = Array.from({ length: 400 }, () => vibeNote());
const lanes = new Set(VIBES.filter(v => notes2.some(n => n.includes(`(${v.id})`))).map(v => v.id));
ok(lanes.size === VIBES.length, `over enough goes, every one comes up (${lanes.size}/${VIBES.length})`);
const first = notes.slice(0, 2);
ok(new Set(notes.slice(0, 12).map(n => (n.match(/\(([a-z-]+)\)/) || [])[1])).size >= 8, "and twelve in a row are not all alike");
ok(first.every(n => /She is \d\d years old/.test(n)), "each one has an age of her own");
ok(notes.every(n => /beautiful, but beautiful in HER way/.test(n)), "…all beautiful, none the same beautiful");
ok(notes.every(n => /one thing that cuts against the type/.test(n)), "…and each is asked for something off-type");
ok(notes.every(n => /Put her actual job, with its place, in "job"/.test(n)), "…and her real job goes on her card");

// 🏷️ Names people actually have.
ok(FIRST_NAMES.length > 60 && LAST_NAMES.length > 40, `a wide pool of ordinary names (${FIRST_NAMES.length} first, ${LAST_NAMES.length} last)`);
ok(FIRST_NAMES.every(n => /^[A-Z][a-z]+$/.test(n)), "every first name is a plain one word");
ok(LAST_NAMES.every(n => !n.includes("-")), "and no double-barrelled surnames");
ok(notes.every(n => /no invented, antique, or hyphenated-exotic names/.test(n)), "the writer is told to skip the odd ones");
ok(notes.every(n => /a plain, modern American name a woman her age really has/.test(n)), "…and to use a name she'd really have");
const offered = new Set<string>();
for (const n of notes2) for (const f of FIRST_NAMES) if (n.includes(`${f},`)) offered.add(f);
ok(offered.size > 50, `with plenty of names put forward, not the same handful (${offered.size})`);

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

// 🙅 No second Chloe: a name already in their world is swapped for one that isn't.
const mine = ["Chloe", "Chloe Hart", "Mara", "Ruth"];
ok(clearName("Nadia", mine) === "Nadia", "a name nobody has comes through as it is");
ok(clearName("Chloe", mine) !== "Chloe", "a name they already have is swapped out");
ok(!mine.map(n => n.split(" ")[0]).includes(clearName("Chloe", mine)), "…for one nobody has");
ok(clearName("Chloe", ["chloe hart"]) !== "Chloe", "it doesn't care about capitals or surnames");
ok(clearName("Mara", []) === "Mara", "with nobody to clash with, nothing changes");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
