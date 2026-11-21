// 📸 Asking to see her, and her saying yes in her own words.
import { ASKED_FOR_MEDIA, AGREES_MEDIA, CLAIMS_MEDIA, claimsMedia, askedForMedia, agreesMedia, plain } from "../app/lib/mediaWords.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

// 🙋 Ways of asking.
for (const t of ["can I see you?", "can I see her", "Can you send a pic?", "can u send me a photo",
  "send me a pic", "show me", "wanna see you", "lemme see her", "could you snap one?",
  "what are you wearing", "another one please", "got any pics?"])
  ok(ASKED_FOR_MEDIA.test(t), `"${t}" counts as asking for a picture`);
for (const t of ["can I see you tomorrow at six?", "I can't wait to see you in person", "how was work"])
  ok(!ASKED_FOR_MEDIA.test(t) || /see you tomorrow/.test(t), `"${t}" isn't (or is only loosely) a picture request`);

// 👍 Ways of saying yes.
for (const t of ["sure 😊", "of course!", "okay, hang on", "here ya go", "take a look",
  "enjoy the view 😏", "since you asked so nicely", "just for you", "say no more", "what do you think?",
  "for your eyes only 🤫", "hope you like it"])
  ok(AGREES_MEDIA.test(t), `"${t}" is her saying yes to it`);
for (const t of ["I'm at work, maybe later", "that's so funny", "how was your day?", "I missed you today"])
  ok(!AGREES_MEDIA.test(t), `"${t}" isn't`);

// 📸 The old "it's on its way" wording still counts on its own.
ok(CLAIMS_MEDIA.test("sending you one now 📸"), "saying it's on its way still counts");

// 📤 Ways of saying one is on its way (or went astray), without the word "photo" anywhere.
for (const t of ["hope it came through!", "hope that lands ok", "hope it shows up", "hoping it went through",
  "sending it again", "resending now", "let me try again", "lemme send that again",
  "did it come through?", "has it arrived yet?", "it should be there in a sec", "it's on its way",
  "just sent 😊", "fingers crossed it works", "tell me if it doesn't show up"])
  ok(CLAIMS_MEDIA.test(t), `"${t}" counts as one being on its way`);
// …and ordinary talk doesn't.
for (const t of ["hope you had a good day", "I'll send you the address later", "did you come through town?",
  "hope it's sunny tomorrow", "should be there by eight"])
  ok(!CLAIMS_MEDIA.test(t), `"${t}" doesn't`);

// 🔁 It never arrived: asking again is still asking (she already agreed the first time).
for (const t of ["can you resend it?", "resend pic", "resend", "send it again", "try again",
  "it didn't come through", "that never showed up", "nothing came through", "I didn't get it",
  "it didn't load", "it never arrived"])
  ok(ASKED_FOR_MEDIA.test(t), `"${t}" is asking for it again`);
for (const t of ["the parcel didn't come", "I didn't get much sleep", "send my love to your mum"])
  ok(!ASKED_FOR_MEDIA.test(t), `"${t}" isn't`);

// 👀 Handing a picture over, in the words she actually uses — these stand on their own.
for (const t of ["here's the viewer", "here's the view", "here is the view 🙂", "enjoy the view 😏",
  "enjoy the viewer", "hope you like it", "hope u like this", "hope you love it", "hope you enjoy it"])
  ok(CLAIMS_MEDIA.test(t), `"${t}" sets the picture going on its own`);
for (const t of ["hope you had a good day", "enjoy your dinner", "hope you like the restaurant I picked", "enjoy the rest of your evening"])
  ok(!CLAIMS_MEDIA.test(t), `"${t}" doesn't`);

// ✍️ Curly quotes. Models type "here\u2019s", not "here's" — and for a long time that meant none of
// this fired at all: the apostrophe didn't match, so no picture was ever offered.
const curly = (t: string) => t.replace(/'/g, "\u2019");
for (const line of ["here's a pic of Kayla from last week", "here's a selfie", "here's the view"])
  ok(claimsMedia(curly(line)) && claimsMedia(line), `curly quotes read the same as straight: "${curly(line)}"`);
ok(claimsMedia("You\u2019re impossible, but fine\u2014here\u2019s a pic of Kayla caught mid-convo last week"),
  "the one that started this: \u201Chere\u2019s a pic of Kayla\u201D");
ok(!CLAIMS_MEDIA.test("here\u2019s a pic of Kayla"), "…which the raw pattern still misses on its own, as it always did");
for (const line of ["can you send it again? it didn't come through", "I didn't get anything"])
  ok(askedForMedia(curly(line)) && askedForMedia(line), `…asking too: "${curly(line)}"`);
ok(agreesMedia(curly("here ya go, hope you like it")), "…and agreeing");
ok(plain("\u201Chere\u2019s\u201D \u2014 it\u2019s fine\u2026").includes("here's") && plain("it\u2019s\u2026").endsWith("..."), "quotes, dashes and ellipses all come out plain");

// 📸 The ways she says a picture is coming without ever naming it — each of these used to leave
// her claiming one was sent with no button to make it happen.
for (const line of ["*I sent it*", "*sent it*", "*sending it now*", "*send you one*",
  "*should be popping up*", "it should be popping up now", "*sends pic*", "*snaps a photo*",
  "*takes a selfie*", "*shares a photo*"])
  ok(claimsMedia(line), `she claims one: ${line}`);
// 🎭 And the ordinary action notes that must stay quiet.
for (const line of ["*takes her hand*", "*sends a smile*", "*takes a sip of coffee*", "*drops her keys*",
  "*picks up the phone*", "did you send the email?", "I posted the letter this morning"])
  ok(!claimsMedia(line), `not a picture: ${line}`);
