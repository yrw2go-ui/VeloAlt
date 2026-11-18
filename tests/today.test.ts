// ☀️ What the Today tab decides to tell you.
//
// The point of these is that it never nags: a person turns up once, for the best reason there is,
// and only when there's something you could do about it.
import { nudgesFrom, happyNow, sinceWords, QUIET_DAYS, UNHAPPY_BELOW, HAPPY_START, type Person } from "../app/lib/todayRules.ts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

const who = (over: Partial<Person> & { name: string }): Person =>
  ({ id: over.name.toLowerCase(), portrait: null, happy: 70, quietDays: 0, seeingToday: false, ...over });

// 🤫 Gone quiet.
const quiet = nudgesFrom([who({ name: "Chloe", quietDays: 9 })]);
ok(quiet.length === 1 && quiet[0].kind === "quiet", "someone you've left alone for nine days comes up");
ok(quiet[0].line === "You haven't texted Chloe in a week.", `…in her own words: "${quiet[0].line}"`);
ok(quiet[0].characterId === "chloe", "and the row knows whose chat to open");
ok(!nudgesFrom([who({ name: "Chloe", quietDays: QUIET_DAYS - 1 })]).length, "a few days isn't being ignored");
ok(nudgesFrom([who({ name: "Chloe", quietDays: QUIET_DAYS })]).length === 1, "five days is");

// 🙁 Not happy.
const sad = nudgesFrom([who({ name: "Belle", happy: 40 })]);
ok(sad.length === 1 && sad[0].kind === "unhappy", "someone unhappy comes up even if you spoke this morning");
ok(sad[0].line === "Belle isn't feeling great about things right now.", `…put gently: "${sad[0].line}"`);
ok(!nudgesFrom([who({ name: "Belle", happy: UNHAPPY_BELOW })]).length, "someone just about content doesn't");
ok(nudgesFrom([who({ name: "Belle", happy: UNHAPPY_BELOW - 1 })]).length === 1, "one point under and she does");

// 🙂 Nobody is told on twice, and nobody is told on for nothing.
ok(!nudgesFrom([who({ name: "Paige", quietDays: null })]).length, "someone you've never messaged isn't being neglected");
ok(!nudgesFrom([who({ name: "Paige", quietDays: 30, seeingToday: true })]).length, "and someone you're seeing today is already above");
const both = nudgesFrom([who({ name: "Mara", quietDays: 20, happy: 20 })]);
ok(both.length === 1 && both[0].kind === "quiet", "gone quiet AND unhappy is one line, not two — the quiet explains it");

// Order: the longest silences first, then the unhappy ones, each alphabetical.
const many = nudgesFrom([who({ name: "Zoe", happy: 30 }), who({ name: "Ada", quietDays: 7 }), who({ name: "Mia", happy: 20 }), who({ name: "Bea", quietDays: 40 })]);
ok(many.map(n => n.who).join(",") === "Ada,Bea,Mia,Zoe", `the quiet ones first, then the unhappy (${many.map(n => n.who).join(", ")})`);

// 😊 Happiness has to agree with what the chat itself works out.
ok(happyNow(60, 0) === 60, "nothing slips while you're talking");
ok(happyNow(60, 2) === 60, "nor on the second quiet day");
ok(happyNow(60, 3) === 57, "the third costs her a little");
ok(happyNow(60, 10) === 36, "ten days costs rather more");
ok(happyNow(60, 400) === 25, "and it never falls past 25");
ok(happyNow(null, 0) === HAPPY_START, "someone new starts content");
ok(happyNow(100, 0) === 100 && happyNow(0, 0) === 0, "it stays between nought and a hundred");
// Which means a saved-happy person can still end up on the list purely from silence.
ok(nudgesFrom([who({ name: "Nia", happy: 60, quietDays: 4 })])[0]?.kind === "unhappy", "four quiet days off a 60 tips her under, so she is worth a word");
ok(!nudgesFrom([who({ name: "Nia", happy: 70, quietDays: 4 })]).length, "…while a happier 70 takes it in her stride");

// How long it's been, in words.
ok(sinceWords(3) === "in 3 days", "three days");
ok(sinceWords(7) === "in a week" && sinceWords(9) === "in a week", "a week");
ok(sinceWords(15) === "in a couple of weeks", "a fortnight");
ok(sinceWords(35) === "in over a month", "a month");
ok(sinceWords(90) === "in months", "longer than that");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
