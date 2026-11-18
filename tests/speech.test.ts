// Run: node --experimental-strip-types tests/speech.test.ts
import { speechNote } from "../app/lib/speech.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const note = "Texts in lowercase, barely any full stops.\nSays “ugh” and “honestly” a lot. Never uses emoji.";

// 🗣️ What's on her card reaches her, word for word.
const on = speechNote({ speech: note, speech_on: true });
ok(on.includes(note), "what's written on her card is what she's told");
ok(/HOW YOU TALK/.test(on), "…under a heading about how she talks, not who she is");

// 🥇 Her personality and description outrank it, and it's told so in as many words.
ok(/YOUR PERSONALITY/.test(on) && /they win/.test(on), "it's told her personality wins where they disagree");
ok(/HOW you say things, nothing else/.test(on) && /never decides what you think, feel, want or do/.test(on),
  "…and that it only shapes how she says things");
ok(/loosely/.test(on), "…and to follow it loosely, like a habit, not a rule");

// 🔌 The switch turns it off without losing the words.
ok(speechNote({ speech: note, speech_on: false }) === "", "switched off, she's told nothing at all");
ok(speechNote({ speech: "", speech_on: true }) === "", "nothing written, nothing sent");
ok(speechNote({ speech: "   \n  ", speech_on: true }) === "", "…and whitespace doesn't count as written");
ok(speechNote({ speech: note }) === on, "a character from before this existed has it on by default");

// Long notes are cut rather than sent whole.
const huge = "x".repeat(3000);
ok(speechNote({ speech: huge, speech_on: true }).includes("x".repeat(1200)) && !speechNote({ speech: huge, speech_on: true }).includes("x".repeat(1201)),
  "a very long note is cut to 1200 characters");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
