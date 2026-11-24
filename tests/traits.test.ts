// 🎚️ Her sliders survive the trip: as an object, as JSON text, and when something is missing.
import { cleanTraits, DEFAULT_TRAITS, TRAITS } from "../app/lib/traits.ts";
let bad = 0;
const ok = (what: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log(`${good ? "PASS" : "FAIL"} ${what}${good ? "" : ` — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`);
};
const k = TRAITS[0].key, k2 = TRAITS[1].key;

ok("an object comes through", cleanTraits({ ...DEFAULT_TRAITS, [k]: 9 })[k], 9);
ok("so does the same thing as JSON text", cleanTraits(JSON.stringify({ ...DEFAULT_TRAITS, [k]: 9 }))[k], 9);
ok("…every slider of it", cleanTraits(JSON.stringify({ [k]: 2, [k2]: 7 }))[k2], 7);
ok("nonsense text falls back to the defaults", cleanTraits("not json"), DEFAULT_TRAITS);
ok("nothing at all falls back to the defaults", cleanTraits(undefined), DEFAULT_TRAITS);
ok("a missing slider keeps its default", cleanTraits({ [k]: 3 })[k2], DEFAULT_TRAITS[k2]);
ok("out of range is pulled back in", cleanTraits({ [k]: 99 })[k], 10);
ok("…at the bottom too", cleanTraits({ [k]: -4 })[k], 0);

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
