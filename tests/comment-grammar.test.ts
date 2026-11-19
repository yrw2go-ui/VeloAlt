// 👖 "That jeans 😍" is not something anyone has ever typed.
//
// The comments that name what someone is wearing are built from templates, and every one of them
// used "that" and "is" whatever the thing was — fine for a dress, wrong for jeans, shorts, boots,
// heels, sneakers, leggings, sunglasses, earrings and the rest.
import { randomComments } from "../app/lib/picaComments.ts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

/** Every comment this photo could draw. */
const linesFor = (photo: string) => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) for (const c of randomComments(photo, "image", 6)) seen.add(c.text);
  return [...seen];
};

const PLURALS = ["jeans", "shorts", "boots", "heels", "sneakers", "leggings", "sunglasses", "earrings", "overalls", "nails", "glasses", "pants"];
const SINGULARS = ["dress", "skirt", "hoodie", "jacket", "bikini", "sweater", "bag", "hat", "necklace", "blouse"];

// ❌ Nobody says "that jeans", "the jeans is" or "jeans looks".
for (const word of PLURALS) {
  const lines = linesFor(`a woman in ${word} by the window`);
  const about = lines.filter(l => l.toLowerCase().includes(word));
  ok(about.length > 0, `${word}: somebody remarks on them (${about.length} ways)`);
  for (const l of about) {
    ok(!new RegExp(`\\bthat ${word}\\b`, "i").test(l), `${word}: never "that ${word}" — "${l}"`);
    ok(!new RegExp(`${word} is\\b`, "i").test(l), `${word}: never "${word} is" — "${l}"`);
    ok(!new RegExp(`${word} looks\\b`, "i").test(l), `${word}: never "${word} looks" — "${l}"`);
    ok(!new RegExp(`where's the ${word}`, "i").test(l), `${word}: never "where's the ${word}" — "${l}"`);
  }
  ok(about.some(l => new RegExp(`\\bthose ${word}\\b`, "i").test(l)), `${word}: "those ${word}" is said`);
  ok(about.some(l => new RegExp(`${word} (are|look)\\b`, "i").test(l)), `${word}: and they "are" / "look", not "is" / "looks"`);
}

// ✅ And a single thing is still spoken of as one.
for (const word of SINGULARS) {
  const about = linesFor(`a woman in a ${word} outside a cafe`).filter(l => l.toLowerCase().includes(word));
  ok(about.length > 0, `${word}: somebody remarks on it`);
  ok(about.some(l => new RegExp(`\\bthat ${word}\\b`, "i").test(l)), `${word}: "that ${word}", as it should be`);
  for (const l of about) {
    ok(!new RegExp(`\\bthose ${word}\\b`, "i").test(l), `${word}: never "those ${word}" — "${l}"`);
    ok(!new RegExp(`${word} are\\b`, "i").test(l), `${word}: never "${word} are" — "${l}"`);
  }
}

// 🧵 Uncountable things behave like a single one: "that hair", not "those hair".
for (const word of ["hair", "makeup", "denim"]) {
  const about = linesFor(`a woman with lovely ${word} in the sun`).filter(l => l.toLowerCase().includes(word));
  for (const l of about) ok(!new RegExp(`\\bthose ${word}\\b|${word} are\\b`, "i").test(l), `${word}: treated as one thing — "${l}"`);
}

// 🧘 "yoga pants" is still leggings, not trousers.
const yoga = linesFor("a woman in yoga pants at the gym");
ok(yoga.some(l => /leggings/i.test(l)), "yoga pants are leggings");
ok(!yoga.some(l => /\bpants\b/i.test(l) && !/yoga/i.test(l)), "…and not trousers as well");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
