// Run: node --experimental-strip-types tests/sore.test.ts
import { MAX_HOURS, soreNote } from "../app/lib/soreWords.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

ok(MAX_HOURS === 48, "she's never sore for more than 48 hours");

// 💔 Properly hurt, an hour in.
const deep = soreNote({ why: "he forgot our plans and didn't say anything", level: 3, since: hoursAgo(1), until: inHours(47), hoursLeft: 47 }, "Sam");
ok(/forgot our plans/.test(deep), "she knows what it's about");
ok(/about an hour ago/.test(deep), "…and when it happened");
ok(/quieter|shorter|holding something back/.test(deep), "being properly hurt makes her quieter and shorter");
ok(/still fresh/.test(deep), "…and it's still fresh");
ok(/Never be cruel|never|Never/.test(deep) && /punishing|silent-treating/.test(deep), "no punishing, no silent treatment, never cruel");
ok(/by this time tomorrow at the latest you've let it go/.test(deep), "and it ends — tomorrow at the latest");
ok(/Sam/.test(deep), "it's about the person she's actually talking to");

// A niggle is a niggle, not a sulk.
const small = soreNote({ why: "he was a bit short with me", level: 1, since: hoursAgo(3), until: inHours(3), hoursLeft: 3 }, "Sam");
ok(/niggle|slight edge|beat of distance/.test(small), "a small thing is a slight edge, not a wall");
ok(/nearly worn off/.test(small), "…and after a few hours it's nearly gone");
ok(!/holding something back/.test(small), "…it isn't written like the deep one");

// Middling, most of a day later.
const mid = soreNote({ why: "he said he'd call and didn't", level: 2, since: hoursAgo(20), until: inHours(6), hoursLeft: 6 }, "");
ok(/subdued/.test(mid) && /nearly worn off|starting to fade/.test(mid), "a middling one is subdued and fading by the next day");
ok(/they/.test(mid), "it reads fine with no name");

// Thawing is always on the table.
for (const n of [deep, small, mid]) if (!/apologises|makes a real effort|simply warm/.test(n)) { ok(false, "a sore spell with no way to mend it"); break; }
ok(true, "every sore spell can be mended by him noticing or making an effort");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
