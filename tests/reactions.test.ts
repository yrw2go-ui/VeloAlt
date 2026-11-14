// Run: node --experimental-strip-types tests/reactions.test.ts
import { REACTIONS, HOT, isHot, isReaction } from "../app/lib/reactions.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 😀 The new ones are there to pick, on a photo or a text.
for (const r of ["👀", "👌", "🤔", "🫣", "💦", "😈"]) ok((REACTIONS as readonly string[]).includes(r), `${r} is one you can react with`);
// …and the old ones didn't go anywhere.
for (const r of ["❤️", "🔥", "🙌", "😍", "👍", "😮", "😂", "🥵", "🤤", "😏", "😅", "😴"]) if (!(REACTIONS as readonly string[]).includes(r)) { ok(false, `${r} went missing`); break; }
ok(true, "every reaction that was there before still is");
ok(new Set(REACTIONS).size === REACTIONS.length, "no duplicates in the bar");
ok(REACTIONS.length === 18, `eighteen to choose from (${REACTIONS.length})`);

// 🔥 The ones she always answers.
ok(HOT.length === 5 && ["🔥", "🥵", "🤤", "💦", "😈"].every(r => isHot(r)), "🔥 🥵 🤤 💦 😈 are the ones that say they really liked it");
for (const r of ["❤️", "👍", "😂", "👀", "👌", "🤔", "🫣", "😏", "😮", "🙌", "😍", "😅", "😴"]) if (isHot(r)) { ok(false, `${r} shouldn't count as one of those`); break; }
ok(true, "a plain ❤️ or 👍 isn't one of them");
ok(HOT.every(r => (REACTIONS as readonly string[]).includes(r)), "…and all of them are reactions you can actually pick");
ok(!isHot("") && !isHot(null) && !isHot(undefined) && !isHot("🔥🔥"), "nothing else counts");
ok(isReaction("💦") && isReaction("😈") && !isReaction("🍕"), "the new ones are accepted and junk isn't");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
