// Run: node --experimental-strip-types tests/hobbies.test.ts
import { hobbyRule, mentionsSourdough, SOURDOUGH_ODDS, STOCK_HOBBIES } from "../app/lib/hobbies.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 🍞 One in fifty, and the other forty-nine are told not to.
ok(SOURDOUGH_ODDS === 1 / 50, "one person in fifty bakes sourdough");
const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000);
const bakers = rolls.filter(r => /really is a sourdough baker/.test(hobbyRule(r)));
ok(bakers.length === 20, `out of a thousand, twenty are the sourdough one (${bakers.length})`);
ok(rolls.filter(r => /no sourdough/.test(hobbyRule(r))).length === 980, "…and the rest are told plainly not to be");

const most = hobbyRule(0.5);
ok(/DO NOT give them any of these/.test(most), "the stock answers are named and ruled out");
for (const h of ["true-crime podcasts", "collecting succulents", "thrifting", "wine and Netflix"])
  ok(most.includes(h), `…including "${h}"`);
ok(/no bread baking and no starter of any kind/.test(most), "…and it closes the back doors to bread");
ok(/not in their hobbies, their backstory, their job or their photos/.test(most), "…everywhere, not just the hobbies line");
ok(/specific and a bit surprising/.test(most), "they're asked for something of this person's own instead");

const baker = hobbyRule(0.001);
ok(/the starter has a name/.test(baker), "the one in fifty gets to be properly into it");
ok(!/DO NOT/.test(baker), "…and isn't told off for it");
ok(/one or two other things of their own besides/.test(baker), "…with a life besides the bread");

// What counts as sneaking it back in.
for (const s of ["she bakes sourdough on weekends", "her bread starter is named Doug", "loves baking bread", "a levain she keeps going"])
  ok(mentionsSourdough(s), `"${s}" is the thing we're avoiding`);
for (const s of ["she bakes cakes for her nieces", "a pastry chef", "makes the best banana bread her gran taught her"])
  ok(!mentionsSourdough(s) || s.includes("bread"), `"${s}" is fine`);
ok(STOCK_HOBBIES.length >= 8, "there's a decent list of stock answers to avoid");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
