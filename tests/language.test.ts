// Run: node --experimental-strip-types tests/language.test.ts
import { traitsPrompt, DEFAULT_TRAITS } from "../app/lib/traits.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const at = (language: number, romance = true) => traitsPrompt({ ...DEFAULT_TRAITS, language }, romance);
const fbomb = (s: string) => /is fair game/.test(s);

// 🤬 F-bombs only above a 5.
for (const v of [0, 1, 3, 4, 5]) ok(!fbomb(at(v)), `at Language ${v} the f-word is never allowed`);
for (const v of [6, 7, 9, 10]) ok(fbomb(at(v)), `at Language ${v} it is`);
ok(/never "fuck"/.test(at(5)), "at a 5 it's said in as many words that it's off");
ok(/"fuck me"/.test(at(8)), `and "fuck me" is one of the examples once it's on`);

// 😤 The milder end, and the phrases that go with it.
ok(/son of a bitch/.test(at(5)), "a 5 swears, mildly — son of a bitch, damn, hell, shit");
ok(/don't be a pussy/.test(at(8)), "a high one talks crude — don't be a pussy");
ok(!/don't be a pussy/.test(at(3)), "a low one doesn't");

// 👂 Understanding it is not the same as using it: everyone understands, at every level.
for (const v of [0, 3, 5, 9]) ok(/understand every swear word/.test(at(v)), `at Language ${v} they still understand swearing`);
ok(/still understand it perfectly well/.test(at(5, false)), "and so does a character who isn't romantic at all");
ok(!/is fair game/.test(at(9, false)), "…who never swears herself, whatever the slider says");

// 🚫 Hate slurs stay out at every level.
ok(/Never hate slurs/.test(at(10)), "hate slurs are never allowed, even at 10");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
