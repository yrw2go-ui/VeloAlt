// 👥 Showing you a woman neither of you knows.
//
// He could send a picture of himself, or of someone you'd both heard of — anyone else was refused
// outright ("You don't know anyone called Lana"). Now he can show you a stranger: someone he saw
// out, someone he came across online. There are no photos to work from, so her description is all
// there is — and afterwards you can turn her into someone on Picagram if you like her.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
const src = (f: string) => readFileSync(new URL(`../app/lib/${f}`, import.meta.url), "utf8");

const media = src("media.ts"), brain = src("brain.ts");

// 🛠️ He's told he can, and told how.
ok(/of_stranger: \{ type: "string"/.test(media), "the picture tool has a way to say 'someone neither of us knows'");
ok(/saw out today|came across online/.test(media), "…described as someone seen out or found online");
ok(/no reference photos for her|There are no photos to work from/.test(media), "…and that her words are all there is to go on");
ok(/never a real person/i.test(media), "…never a real person");
ok(/don't give her the name of anyone you both know/i.test(media), "…and not named after someone they know");
ok(/For someone NEITHER of you knows, use of_stranger instead/.test(media), "the old field points at the new one");

// 🚫 The check that refused her is skipped — but only for a stranger.
ok(/const other = !stranger && typeof who === "string"|let other = !stranger && typeof who === "string"/.test(brain),
  "a stranger skips the do-you-know-her check");
ok(/if \(stranger && !\(typeof who === "string" && who\.trim\(\)\)\)/.test(brain),
  "…and naming someone they know still goes through the check as before");

// 📸 It's a picture of HER, not of him.
ok(/with_me: false, with_them: false/.test(brain), "he isn't in it");
ok(/picture is of this woman on her own/.test(brain), "…and the picture says so");
// ⚠️ The description must not carry a name from their own life, or the app reads it as someone
// they already know and won't offer to put her on Picagram.
ok(!/whoever sent it is not in it[\s\S]{0,40}\$\{ch\?\.name/.test(brain), "…without naming him, which would hide the Picagram offer");
ok(/won't offer to put her on Picagram/.test(brain), "…and that reason is written down");

// 🖐️ A photo of a person still gets the lines about hands and how it was taken.
ok(/const stranger = typeof a\.of_stranger === "string"/.test(media), "the picture service knows it's a person");
ok(/!\(withMe \|\| o \|\| stranger\)/.test(media), "…so the framing and anatomy lines go on it");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
