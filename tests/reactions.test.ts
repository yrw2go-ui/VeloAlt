// Run: node --experimental-strip-types tests/reactions.test.ts
import { SIGN_OFF, REACTIONS, HOT, isHot, isReaction, reactChance, reactsThisTime } from "../app/lib/reactions.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 😀 The new ones are there to pick, on a photo or a text.
for (const r of ["👀", "👌", "🤔", "🫣", "💦", "😈"]) ok((REACTIONS as readonly string[]).includes(r), `${r} is one you can react with`);
// …and the old ones didn't go anywhere.
for (const r of ["❤️", "🔥", "🙌", "😍", "👍", "😮", "😂", "🥵", "🤤", "😏", "😅", "😴"]) if (!(REACTIONS as readonly string[]).includes(r)) { ok(false, `${r} went missing`); break; }
ok(true, "every reaction that was there before still is");
ok(new Set(REACTIONS).size === REACTIONS.length, "no duplicates in the bar");
ok(REACTIONS.length === 20, `twenty to choose from (${REACTIONS.length})`);
// 👋 The ones she signs off with, hearts most of all.
ok(SIGN_OFF.every(r => (REACTIONS as readonly string[]).includes(r)), "every sign-off reaction is one you can give too");
ok(SIGN_OFF.filter(r => r === "❤️").length / SIGN_OFF.length > 0.5, "a heart is the usual one");
ok(["😍", "☺️", "😘"].every(r => (SIGN_OFF as readonly string[]).includes(r)), "…with heart eyes, a blush and a kiss as the others");

// 🔥 The ones she always answers.
ok(HOT.length === 5 && ["🔥", "🥵", "🤤", "💦", "😈"].every(r => isHot(r)), "🔥 🥵 🤤 💦 😈 are the ones that say they really liked it");
for (const r of ["❤️", "👍", "😂", "👀", "👌", "🤔", "🫣", "😏", "😮", "🙌", "😍", "😅", "😴"]) if (isHot(r)) { ok(false, `${r} shouldn't count as one of those`); break; }
ok(true, "a plain ❤️ or 👍 isn't one of them");
ok(HOT.every(r => (REACTIONS as readonly string[]).includes(r)), "…and all of them are reactions you can actually pick");
ok(!isHot("") && !isHot(null) && !isHot(undefined) && !isHot("🔥🔥"), "nothing else counts");
ok(isReaction("💦") && isReaction("😈") && !isReaction("🍕"), "the new ones are accepted and junk isn't");

// 🎲 About one message in seven gets a reaction — more when there's feeling in it, less on a quick "ok".
ok(reactChance("I got the job today, going to celebrate tonight") === 0.15, "an ordinary message: about 15%");
ok(reactChance("I miss you so much ❤️") > 0.15 && reactChance("haha you're ridiculous") > 0.15, "a sweet or funny one: more");
ok(reactChance("", true) > reactChance("I miss you"), "a photo they sent: more still");
ok(reactChance("ok") < 0.1 && reactChance("k") < 0.1 && reactChance("what time?") < 0.15, "a quick ok or a short question: less");
const msgs = ["Long day at work, finally home", "What are you up to tonight", "I think I'll make pasta", "The weather is weird today", "My sister called earlier", "Watching a movie now"];
let n = 0; const N = 6000;
for (let i = 0; i < N; i++) if (reactsThisTime(msgs[i % msgs.length], false, ((i * 7919) % 10007) / 10007)) n++;
const rate = n / N;
ok(rate > 0.12 && rate < 0.18, `over a long everyday chat she reacts to about 15% of messages (${(rate * 100).toFixed(1)}%)`);
ok(!reactsThisTime("hello there", false, 0.99) && reactsThisTime("hello there", false, 0.01), "the roll decides each one");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
