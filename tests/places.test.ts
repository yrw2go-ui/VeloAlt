// 🗺️ Opening hours: the ordinary ones, the ones that run past midnight, and the seasonal ones.
import { placeById, placeOpen, PLACES } from "../app/lib/places.ts";
let bad = 0;
const ok = (what: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) bad++;
  console.log(`${good ? "PASS" : "FAIL"} ${what}${good ? "" : ` — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`}`);
};
const p = (id: string) => placeById(id)!;

ok("Hooters is open at lunch", placeOpen(p("hooters"), "12:00", 6), true);
ok("…and shut at 3am", placeOpen(p("hooters"), "03:00", 6), false);
ok("…and shut the minute it closes", placeOpen(p("hooters"), "23:00", 6), false);
ok("the brewery is open at 9pm", placeOpen(p("hotshots"), "21:00", 6), true);
ok("…still open at 1am, past midnight", placeOpen(p("hotshots"), "01:00", 6), true);
ok("…but not at 2pm", placeOpen(p("hotshots"), "14:00", 6), false);
ok("the pool is open in July", placeOpen(p("pool"), "10:00", 7), true);
ok("…and closed in December, whatever the hour", placeOpen(p("pool"), "10:00", 12), false);
ok("the orchard is open in October", placeOpen(p("orchard"), "10:00", 10), true);
ok("…and shut in May", placeOpen(p("orchard"), "10:00", 5), false);
ok("your house is always open", placeOpen(p("home"), "04:00", 2), true);
ok("the brewery is 21+", !!p("hotshots").adult, true);
ok("Chicago isn't local", !!p("chicago").away, true);
ok("an unknown spot is nobody's", placeById("nowhere"), null);
ok("every spot has a name and an emoji", PLACES.every(x => !!x.name && !!x.emoji), true);

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
