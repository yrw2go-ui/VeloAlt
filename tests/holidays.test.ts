// Run: node --experimental-strip-types tests/holidays.test.ts
import { holidayBefore, holidays, holidayOn, noClass, termEnds, termStarts, springBreak, thanksgiving, thanksgivingBreak, worksHoliday } from "../app/lib/holidays.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 📅 The fixed points of 2026.
ok(thanksgiving(2026) === "2026-11-26", "Thanksgiving 2026 is the 26th");
ok(thanksgivingBreak(2026) === "2026-11-23", "…and her week off starts that Monday");
ok(termEnds(2026) === "2026-06-05", "term ends the first Friday of June");
ok(termStarts(2026) === "2026-09-14", "term starts the second Monday of September");
ok(springBreak(2026) === "2026-03-09", "spring break starts the second Monday of March");
ok(holidayOn("2026-07-04") === "Independence Day", "the 4th is the 4th");
ok(holidayOn("2026-05-25") === "Memorial Day", "Memorial Day is the last Monday of May");
ok(holidays(2026).length === 14, "fourteen holidays in the year");

// 🎓 No class when she should be off, class when she shouldn't.
const cases: [string, string | null][] = [
  ["2026-11-24", "Thanksgiving break"],
  ["2026-11-27", "Thanksgiving break"],
  ["2026-11-30", null],
  ["2026-12-25", "Christmas break"],
  ["2026-12-21", "Christmas break"],
  ["2027-01-02", "Christmas break"],
  ["2027-01-05", null],
  ["2026-03-11", "spring break"],
  ["2026-03-16", null],
  ["2026-07-15", "summer break"],
  ["2026-05-25", "Memorial Day"],
  ["2026-11-11", "Veterans Day"],
  ["2026-02-16", "Presidents' Day"],
  ["2026-10-13", null],
];
for (const [date, want] of cases) ok(noClass(date) === want, `${date} → ${want ?? "class as normal"} (got ${noClass(date)})`);
// A holiday on a weekend changes nothing: Juneteenth 2027 is a Saturday.
ok(noClass("2027-06-19") === "summer break", "a weekend holiday isn't a day off of its own");

// 🎉 Work on a holiday: most are off, about one in six works, and never two in a row.
const ids = Array.from({ length: 600 }, (_, i) => `char-${i}`);
const share = (date: string) => ids.filter(id => worksHoliday(id, date)).length / ids.length;
for (const date of ["2026-12-25", "2026-07-04", "2026-11-26"]) {
  const s = share(date);
  ok(s > 0.08 && s < 0.26, `${date}: roughly one in six is working (${Math.round(s * 100)}%)`);
}
ok(worksHoliday("char-7", "2026-12-25") === worksHoliday("char-7", "2026-12-25"), "and it doesn't change mid-chat");
// Nobody is put on two holidays in a row.
const run = [...holidays(2026), ...holidays(2027)].map(h => h.date).sort();
for (const id of ids) {
  const worked = run.filter(d => worksHoliday(id, d));
  const back2back = worked.some(d => { const i = run.indexOf(d); return i > 0 && worked.includes(run[i - 1]); });
  if (back2back) { ok(false, `${id} was put on two holidays in a row`); break; }
}
ok(true, "nobody works two holidays in a row");
ok(holidayBefore("2027-01-01") === "2026-12-31", "the holiday before New Year's Day is New Year's Eve");
ok(ids.some(id => worksHoliday(id, "2026-07-04")) && ids.some(id => !worksHoliday(id, "2026-07-04")), "some work it, most don't — never all, never none");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
