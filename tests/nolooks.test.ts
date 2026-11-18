// Run: node --experimental-strip-types tests/nolooks.test.ts
// 🎨 Her looks belong to the reference photos, not to the words.
import { noLooks } from "../app/lib/mediaWords.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const gone = (s: string, ...words: string[]) => words.every(w => !new RegExp(w, "i").test(noLooks(s)));

// 💇 Hair, in whatever order the words come.
for (const s of ["long dark wavy hair", "shoulder-length blonde hair", "her jet-black hair", "short red hair", "silky brown hair", "platinum hair"])
  ok(!/hair/i.test(noLooks(`standing in the kitchen with ${s}, holding a mug`)), `"${s}" comes out`);
// 👁️ Eyes and skin.
ok(gone("A woman with bright green eyes, sitting on a bench", "green", "eyes"), "eyes come out");
ok(gone("woman with warm caramel skin, laughing", "caramel", "skin"), "so does skin");
ok(gone("a gorgeous blonde in a red dress", "blonde"), "and so does being called a blonde");
ok(gone("a redhead at the bar", "redhead"), "…or a redhead");

// 🧹 And what's left still reads like a sentence.
const real = noLooks("Gorgeous young woman with warm caramel skin and long dark wavy hair, wearing a fitted lavender tank top and high-waisted jeans, leaning against a sunny kitchen counter holding a ceramic mug");
ok(/wearing a fitted lavender tank top/.test(real) && /ceramic mug/.test(real), "everything the photos can't know is kept");
ok(!/\bwith\s*,/.test(real) && !/\band\s*,/.test(real) && !/,\s*,/.test(real), `no dangling words left behind: "${real.slice(0, 44)}…"`);
ok(!/^[,\s]/.test(real) && !/[,\s]$/.test(real), "…and no stray commas at either end");

// 🙅 What it must never touch: where she is, what she's wearing, what she's doing, the light.
for (const s of [
  "sitting on the sofa in her work clothes, laughing at something off camera",
  "standing by the window in grey light, hair tied up",
  "holding up the Gucci purse, grinning at the camera",
  "wearing the team gear, showing it off to the camera",
  "in a black dress at the bar, mid-laugh",
]) ok(noLooks(s) === s, `left exactly alone: "${s.slice(0, 40)}…"`);
ok(noLooks("") === "", "nothing in, nothing out");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
