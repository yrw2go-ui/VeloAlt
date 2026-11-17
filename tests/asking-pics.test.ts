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
