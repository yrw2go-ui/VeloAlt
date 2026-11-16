// 📸 "I sent an image" is a photo going out, the same as "I sent a pic".
import { CLAIMS_MEDIA, MENTIONS_MEDIA } from "../app/lib/mediaWords.ts";
import { dropSentNote } from "../app/lib/text.ts";

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

// 🙈 Her scaffolding, cut from what she says.
for (const [raw, want] of [
  ["Here you go! Try not to stare 👋✨\n\n(I sent an image)", "Here you go! Try not to stare 👋✨"],
  ["ok here it is (sent a photo: \"me on the couch\")", "ok here it is"],
  ["[photo sent] hope you like it", "hope you like it"],
  ["I love that picture of you", "I love that picture of you"],
  ["(I sent my love)", "(I sent my love)"],
] as [string, string][]) {
  const got = dropSentNote(raw);
  ok(got === want, `scaffolding cut: ${JSON.stringify(raw)} → ${JSON.stringify(got)}`);
}
