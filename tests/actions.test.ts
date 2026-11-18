// Run: node --experimental-strip-types tests/actions.test.ts
// 🫱 When all they send is an action.
import { onlyAction, answerTo, actionNote, ACTION_EMOJI } from "../app/lib/actions.ts";
import { isMeta, isOnlyEmoji } from "../app/lib/text.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 🔎 What counts as nothing but an action.
for (const t of ["*moves closer to her and cuddles*", "*cuddles*", "*moves closer* *smiles*", "  *leans in*  ", "*kisses her cheek*."])
  ok(onlyAction(t), `"${t.trim()}" is all action`);
for (const t of ["*laughs* yeah okay", "hey", "", "what are you up to?", "I *really* mean it", "*", "**"])
  ok(!onlyAction(t), `"${t}" isn't`);

// 🎲 How she answers: sometimes an emoji, sometimes an action, mostly words.
const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000);
const got = rolls.map(answerTo);
const share = (a: string) => got.filter(x => x === a).length / 10;
ok(share("emoji") > 15 && share("emoji") < 35, `about a quarter get one emoji (${share("emoji")}%)`);
ok(share("action") > 20 && share("action") < 45, `about a third get an action back (${share("action")}%)`);
ok(share("words") > 35, `and most still get words (${share("words")}%)`);
ok(answerTo(0.1) === answerTo(0.1), "the same roll always lands the same way");

// 😏 The emoji answer.
const emoji = actionNote("emoji", "Sam");
ok(/ONE emoji and nothing else/.test(emoji), "one emoji, and nothing else at all");
for (const e of ["😏", "❤️", "😈", "😳", "🫣", "🤨"]) ok(emoji.includes(e), `…${e} is one of the ones she can pick`);
ok(ACTION_EMOJI.length >= 12, `there are plenty to choose from (${ACTION_EMOJI.length})`);
ok(/how you feel about them right now, your personality and your sliders/.test(emoji), "…chosen by how she feels, who she is and her sliders");
ok(/Pleased, shy, amused, smug, unsure, unimpressed/.test(emoji), "…and it can be any of those, not only a warm one");

// 🫱 The action answer.
const action = actionNote("action", "Sam");
ok(/ONE action of your own, in \*asterisks\*/.test(action), "an action back, in asterisks");
ok(/no words before or after it/.test(action), "…with nothing said out loud");
ok(/settle in closer/.test(action) && /pull back a little/.test(action), "…and it doesn't have to be a warm one either");
ok(actionNote("words", "Sam") === "", "when she's talking as usual, she's told nothing extra");

// 😶 An emoji on its own is a real reply — it used to be thrown away for having no letters in it.
for (const e of ["😏", "❤️", "🫣", "😏😳", " 😘 "]) ok(!isMeta(e) && isOnlyEmoji(e), `"${e.trim()}" counts as an answer`);
ok(!isMeta("*settles in closer to enjoy the warmth and closeness*"), "and so does an action on its own");
ok(isMeta("(the system is waiting for their reply)"), "…while app narration still doesn't");
ok(!isOnlyEmoji("😏 hey"), "an emoji with words is just a message");
ok(!isOnlyEmoji(""), "and nothing is nothing");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
