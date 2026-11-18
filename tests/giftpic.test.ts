// 📸 A gift photo has to be a photo of HER.
//
// Her reference pictures only reach the picture service when `with_me` is set. Without it they are
// fetched, handed over and then dropped on the floor: the picture is drawn from words alone, from a
// text-to-image model rather than the one that works from photographs, with nothing in the prompt
// describing her and nothing keeping her head in frame. It came out looking like someone else.
//
// There is no way to assert that from the outside without a picture service, so this reads the
// source of every place that asks for a picture of a character and insists on the flag.
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

const src = (f: string) => readFileSync(new URL(`../app/lib/${f}`, import.meta.url), "utf8");

// Every startMedia call that hands over a character's own refs must set with_me.
for (const [file, what] of [["thanks.ts", "a thank-you for a present"], ["peek.ts", "a peek"], ["picaDm.ts", "a photo in her DMs"]] as const) {
  const text = src(file);
  const calls = text.split("startMedia(").slice(1);
  ok(calls.length > 0, `${file}: asks for a picture at all`);
  for (const call of calls) {
    const head = call.slice(0, call.indexOf("}") + 1);
    ok(/with_me:\s*true/.test(head), `${what} is a picture of her, so it sets with_me`);
  }
}

// And the thank-you really does hand over her references.
const thanks = src("thanks.ts");
ok(/refs:\s*await referenceUrls\(ch\)/.test(thanks), "the thank-you hands over her reference pictures");
ok(/reference pictures/.test(thanks), "…and tells the picture service it is the same woman");

// 🚫 The guard that goes with it: strip her colouring ONLY when references are really in play,
// because otherwise nothing is left to say what she looks like.
const media = src("media.ts");
ok(/hasRefs[\s\S]{0,200}noLooks/.test(media), "hair and eye colour are only dropped when there are references to go on");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
