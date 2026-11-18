// 👄 Lip-biting never reaches the picture service: it comes out deformed.
import { noLipBite } from "../app/lib/mediaWords.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const gone = (t: string) => !/bit|nibbl|chew/i.test(noLipBite(t));
for (const t of [
  "Leaning on the bar, biting her lip, warm light",
  "She bites her lower lip and smiles",
  "A soft look, gently biting her bottom lip, evening sun",
  "close up, lip bite, dark eyeliner",
  "playfully nibbling her lip at the camera",
  "her lower lip caught between her teeth",
  "chewing her lip nervously by the window",
]) ok(gone(t), `it's taken out of "${t}" → "${noLipBite(t)}"`);

// …and the rest of the sentence survives.
ok(noLipBite("Leaning on the bar, biting her lip, warm light") === "Leaning on the bar, warm light", "what's left still reads properly");
ok(noLipBite("At the beach in a yellow sundress, big smile") === "At the beach in a yellow sundress, big smile", "a picture without it is untouched");
ok(noLipBite("She bites into an apple") === "She bites into an apple", "biting something else is fine");
