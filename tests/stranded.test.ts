// Run: node --experimental-strip-types tests/stranded.test.ts
// 📸 A picture's description left stranded in what she said.
import { orphanDescription, dropOrphanDescription, cleanReply } from "../app/lib/text.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// The one from the chat: the tag was stripped and the argument was left behind.
const real = `You’re impossible, but fine—here’s a pic of Kayla caught mid-convo last week when we were grabbing coffee. She’s got that same giddy energy in person, which explains why she never stops talking. : "Gorgeous young woman with warm caramel skin and long dark wavy hair, wearing a fitted lavender tank top and high-waisted jeans, leaning against a sunny kitchen counter holding a ceramic mug, laughing mid-sentence with a slight head tilt.")`;
const got = orphanDescription(real);
ok(!!got && /Gorgeous young woman/.test(got), "the stranded description is found");
ok(!!got && /head tilt/.test(got) && !got.includes('"'), "…whole, and without its quotes");
const left = dropOrphanDescription(real);
ok(/never stops talking\.$/.test(left), `…and what's left is just what she said: "…${left.slice(-28)}"`);
ok(!/Gorgeous|caramel|lavender/.test(left), "…with none of the description in it");

// 🗣️ What she actually said in quotes is not a description.
ok(orphanDescription(`and then she goes "I am never doing that again, not for anyone, ever"`) === null,
  "something she quoted out loud is left alone");
ok(orphanDescription(`he told me "the site opens at six and not a minute before"`) === null, "…so is anything else quoted");
ok(orphanDescription(`"yes"`) === null, "a short quote is never a description");
ok(orphanDescription("no quotes here at all") === null, "and no quotes, nothing to find");
ok(dropOrphanDescription("no quotes here at all") === "no quotes here at all", "…which leaves the message untouched");

// It only counts at the very end — a description mid-sentence is her talking.
ok(orphanDescription(`"she was wearing a red dress" is how he described her, apparently`) === null,
  "a quote in the middle of a sentence is left alone");

// 🧹 And the usual cleaning still runs.
ok(cleanReply("hey there") === "hey there", "an ordinary message comes through untouched");

// 📸 And the line that says one is coming.
const SENDING = /\*\s*sending\s+(image|photo|picture|video|clip)\s*\*/i;
ok(SENDING.test("here you go\n\n*sending image*"), "the message says a picture is on its way");
ok(SENDING.test("*sending video*"), "…or a video");
ok(!SENDING.test("here you go"), "…and an ordinary message doesn't");
ok(SENDING.test("*Sending Image*"), "…however it's capitalised");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
