// 💔 A present from someone who has hurt you.
//
// She appreciates it and says so, and she doesn't pretend everything is fine. It warms her a
// little; the next one warms her more. She is still herself throughout.
import { moodOf, photoOdds, hurtNote, warmth, spendWeight, thanksFallback, boostScale, FINE_FROM, SORE_BELOW } from "../app/lib/hurt.ts";

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
ok(/plain and ordinary/i.test(deep) && /plain and ordinary/i.test(sore), "and both ask for plain words, not a performance");
ok(/doesn't perform/i.test(deep), "…because someone who has been hurt doesn't perform");
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

// 💗 It warms her: more when she's low, more when you've kept at it, more when it was thoughtful,
// and more when you really spent on it.
ok(warmth(15, 1, false, 100) > warmth(80, 1, false, 100), "a present means more to someone who's low");
ok(warmth(15, 4, false, 100) > warmth(15, 1, false, 100), "keeping at it means more again");
ok(warmth(15, 1, true, 100) > warmth(15, 1, false, 100), "something she actually wanted lands harder");
ok(warmth(15, 1, false, 2450) > warmth(15, 1, false, 75), "and a dear one lands harder than a cheap one");
ok(warmth(15, 1, false, 10) === warmth(15, 1, false, 12), "a coffee is a coffee either way");
ok(warmth(0, 20, true, 100000) <= 8, "but never a clean slate in one go");
ok(warmth(80, 1, false, 10) >= 1, "it always helps at least a little");

// 💰 What it cost, on the same curve the warm spell uses.
ok(spendWeight(10) === 0, "a tenner is the bottom of the scale");
ok(spendWeight(75) > spendWeight(10) && spendWeight(75) < 1.5, "flowers are worth something");
ok(spendWeight(2450) > spendWeight(425), "a Gucci purse outweighs a necklace");
ok(spendWeight(7350) <= 3 && spendWeight(1000000) <= 3, "and the top end never runs away");
ok(spendWeight(0) === 0 && spendWeight(-5) === 0, "nothing silly from nothing");


// 🤐 What she says when her brain doesn't answer. This used to be one chirpy line for everybody
// that read the label back — "it came!! Flowers a dozen roses, delivered 😍 you're ridiculous".
const PERFORMED = /you're ridiculous|menace|obsessed|screaming|deceased|destroying it|absolute unit/i;
const everyone = [
  ["cold", { coldness: 9 }], ["moody", { moody: 9 }], ["lively", { energetic: 9 }],
  ["funny", { humor: 9 }], ["flirty", { flirty: 9 }], ["ordinary", {}],
] as const;

for (const [who, t] of everyone) {
  for (const happy of [80, 45, 15]) {
    for (const money of [true, false]) {
      const line = thanksFallback(t, happy, money);
      ok(!!line.trim(), `${who} at ${happy}: there's something to say`);
      ok(!PERFORMED.test(line), `${who} at ${happy}: no performed slang — "${line.slice(0, 40)}…"`);
      ok(!/\{|\}/.test(line), `${who} at ${happy}: nothing left unfilled`);
      ok(/thank|thanks/i.test(line), `${who} at ${happy}: she does thank you`);
    }
  }
}

// 💔 Hurt or sore, nobody is chirpy about it, whoever they are.
for (const [who, t] of everyone) {
  const hurt = thanksFallback(t, 15, false), sore = thanksFallback(t, 45, false);
  ok(/don't|doesn't|aren't/i.test(hurt), `${who}: hurt — the other half is said too`);
  ok(!/😍|IT CAME/i.test(hurt), `${who}: hurt — and not cheerful about it`);
  ok(hurt !== thanksFallback(t, 80, false), `${who}: hurt reads differently from a good day`);
  ok(sore !== thanksFallback(t, 80, false), `${who}: so does sore`);
}

// 🙂 On a good day she sounds like herself, and only a livewire gets an exclamation.
ok(thanksFallback({ coldness: 9 }, 80, false) !== thanksFallback({ energetic: 9 }, 80, false), "a cold one and a livewire don't say the same thing");
ok(!/😍|😄/.test(thanksFallback({ coldness: 9 }, 80, false)), "a cold one doesn't get an excited emoji");
ok(/😍/.test(thanksFallback({ energetic: 9 }, 80, false)), "a livewire does");

// 🏷️ And it never reads the label back, because the 🎁 line above already says what turned up.
for (const [, t] of everyone) for (const happy of [80, 15]) {
  ok(!/roses|purse|latte|\$/.test(thanksFallback(t, happy, false)), "the present is never named in it");
}

// 🎁 The warm spell still applies while she's sore — just not as though nothing happened.
ok(boostScale(80, 1) === 1, "when things are fine it lands in full");
ok(boostScale(15, 1) > 0 && boostScale(15, 1) < 1, "hurt: it still applies, but she feels it less");
ok(boostScale(45, 1) > boostScale(15, 1), "sore: more of it than when she's really hurt");
ok(boostScale(15, 4) > boostScale(15, 1), "and more presents close the gap");
ok(boostScale(15, 40) <= 1, "never more than the whole of it");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
