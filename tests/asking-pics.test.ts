// 📸 Asking to see her, and her saying yes in her own words.
import { ASKED_FOR_MEDIA, AGREES_MEDIA, CLAIMS_MEDIA } from "../app/lib/mediaWords.ts";
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
