// 📸 "I sent an image" is a photo going out, the same as "I sent a pic".
import { CLAIMS_MEDIA, MENTIONS_MEDIA } from "../app/lib/mediaWords.ts";
import { dropSentNote, cleanReply, writtenCall, dropWrittenCall } from "../app/lib/text.ts";

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

// 🧰 A call she wrote out as words instead of making it.
const leaked = `Well, I am supposed to be working right now... but if I duck under my desk long enough, Father Harris won't notice. 😉

(send_media(kind='image', description='Sitting at a messy office desk with stacks of paperwork. She holds a steaming mug of coffee.', with_me=True))`;
const call = writtenCall(leaked);
ok(!!call, "a written-out send_media is spotted");
ok(call?.kind === "image", "…its kind is read");
ok(/messy office desk/.test(call?.description || ""), "…and its description: " + (call?.description || "").slice(0, 40));
ok(call?.with_me === true, "…and who's in it");
const left = dropWrittenCall(leaked);
ok(/duck under my desk/.test(left) && !/send_media/.test(left), "…and what she actually said is left behind: " + left.slice(0, 40));
ok(writtenCall("I sent you a picture of my desk") === null, "an ordinary sentence isn't mistaken for one");
ok(writtenCall("send_media(kind='image')") === null, "…nor is a call with nothing to draw");
const other = `here you go! <invoke name="send_media"><parameter name="description">me on the couch</parameter></invoke>`;
ok(/here you go/.test(cleanReply(other)) && !/send_media/.test(cleanReply(other)), "the tag form is still stripped as before");
