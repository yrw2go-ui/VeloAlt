// 💔 A present from someone who has hurt you.
//
// She appreciates it and says so, and she doesn't pretend everything is fine. It warms her a
// little; the next one warms her more. She is still herself throughout.
import { moodOf, photoOdds, hurtNote, warmth, boostScale, FINE_FROM, SORE_BELOW } from "../app/lib/hurt.ts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

// 🙂 Where the lines are.
ok(moodOf(80) === "fine" && moodOf(FINE_FROM) === "fine", "content enough and a present just lands");
ok(moodOf(FINE_FROM - 1) === "sore" && moodOf(SORE_BELOW) === "sore", "below that it's complicated");
ok(moodOf(SORE_BELOW - 1) === "hurt" && moodOf(0) === "hurt", "and low down she's really hurt");

// 💬 What she's told, and what she is never told.
ok(hurtNote(80, 1, "Sam") === "", "when things are fine there's nothing extra to say");
const sore = hurtNote(45, 1, "Sam"), deep = hurtNote(15, 1, "Sam");
for (const [label, note] of [["sore", sore], ["hurt", deep]] as const) {
  ok(!!note, `${label}: she is told how she feels about it`);
  ok(/appreciate|like it, genuinely/i.test(note), `${label}: …that she does appreciate it`);
  ok(/YOUR voice|however you'd normally/i.test(note), `${label}: …and that she is still herself`);
  ok(/never mention sliders/i.test(note), `${label}: …and never to mention the machinery`);
  ok(/Sam/.test(note), `${label}: …by name`);
}
ok(/doesn't undo what happened|don't quite know what to do with it/i.test(deep), "hurt: the other half is said out loud");
ok(/not punishing them/i.test(deep), "hurt: …without being cruel about it");
ok(/Warm, but not all the way back/i.test(sore), "sore: warm, but not all the way back");

// 🎁 More presents ease it — she gives more of herself, despite being hurt.
ok(!/isn't the first thing/.test(hurtNote(15, 1, "Sam")), "one present on its own is just that");
ok(/isn't the first thing they've sent/i.test(hurtNote(15, 2, "Sam")), "a second one has been noticed");
ok(/kept at it/i.test(hurtNote(15, 4, "Sam")), "keeping at it is noticed more");
ok(/closer to your old self/i.test(hurtNote(15, 4, "Sam")), "…and she lets it show");

// 📷 A photo is less likely while she's sore, and presents earn it back.
ok(photoOdds(0.7, 80, 1) === 0.7, "when things are fine, the photo is as likely as ever");
ok(photoOdds(0.7, 15, 1) < 0.7, "someone hurt is less inclined to pose");
ok(photoOdds(0.7, 45, 1) < 0.7 && photoOdds(0.7, 45, 1) > photoOdds(0.7, 15, 1), "sore sits in between");
ok(photoOdds(0.7, 15, 4) > photoOdds(0.7, 15, 1), "…and more presents earn one back");
ok(photoOdds(0.7, 15, 20) <= 0.7, "never more likely than on a good day");
ok(photoOdds(0.7, 0, 1) >= 0.1, "and never quite impossible");

// 💗 It warms her: more when she's low, more when you've kept at it, more when it was thoughtful.
ok(warmth(15, 1, false, false) > warmth(80, 1, false, false), "a present means more to someone who's low");
ok(warmth(15, 4, false, false) > warmth(15, 1, false, false), "keeping at it means more again");
ok(warmth(15, 1, true, false) > warmth(15, 1, false, false), "something she actually wanted lands harder");
ok(warmth(15, 1, false, true) > warmth(15, 1, false, false), "and so does a big one");
ok(warmth(0, 20, true, true) <= 8, "but never a clean slate in one go");
ok(warmth(80, 1, false, false) >= 1, "it always helps at least a little");

// 🎁 The warm spell still applies while she's sore — just not as though nothing happened.
ok(boostScale(80, 1) === 1, "when things are fine it lands in full");
ok(boostScale(15, 1) > 0 && boostScale(15, 1) < 1, "hurt: it still applies, but she feels it less");
ok(boostScale(45, 1) > boostScale(15, 1), "sore: more of it than when she's really hurt");
ok(boostScale(15, 4) > boostScale(15, 1), "and more presents close the gap");
ok(boostScale(15, 40) <= 1, "never more than the whole of it");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
