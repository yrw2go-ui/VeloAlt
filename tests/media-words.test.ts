// 📸 "I sent an image" is a photo going out, the same as "I sent a pic".
import { CLAIMS_MEDIA, MENTIONS_MEDIA } from "../app/lib/mediaWords.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

for (const s of ["(I sent an image)", "Sending you an image now", "here's the image you wanted", "Sending you a pic 😘", "here's a selfie", "snapping one now 📸", "It's on its way! 📸"])
  ok(CLAIMS_MEDIA.test(s), `counts as sending one: ${s}`);
for (const s of ["I imagine you'd like that", "Glad you're enjoying the view! 😉", "I'm stuck at work right now 😩"])
  ok(!CLAIMS_MEDIA.test(s), `not sending one: ${s}`);
ok(MENTIONS_MEDIA.test("want me to send you an image?"), "an offered image counts as mentioning one");
ok(!MENTIONS_MEDIA.test("just imagine it"), "\"imagine\" doesn't");

if (bad) { console.log(`${bad} failed`); process.exit(1); }
console.log("all good");
