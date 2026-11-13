// 📅 The year's shape: the holidays everyone knows, and the school breaks around them.
// Dates are plain local dates ("2026-11-26") — each character's own, in her own time zone.
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
/** The nth given weekday of a month (nth = 1 for the first, -1 for the last). */
function nth(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) return 1 + ((weekday - dow(y, m, 1) + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((dow(y, m, last) - weekday + 7) % 7);
}
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parse = (date: string) => date.split("-").map(Number) as [number, number, number];
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Thanksgiving: the fourth Thursday of November. */
export const thanksgiving = (y: number) => ymd(y, 11, nth(y, 11, 4, 4));

/** The holidays a normal week bends around, for a given year. */
export function holidays(y: number): { date: string; name: string }[] {
  const thx = thanksgiving(y), [, , td] = parse(thx);
  return [
    { date: ymd(y, 1, 1), name: "New Year's Day" },
    { date: ymd(y, 1, nth(y, 1, 1, 3)), name: "Martin Luther King Jr. Day" },
    { date: ymd(y, 2, nth(y, 2, 1, 3)), name: "Presidents' Day" },
    { date: ymd(y, 5, nth(y, 5, 1, -1)), name: "Memorial Day" },
    { date: ymd(y, 6, 19), name: "Juneteenth" },
    { date: ymd(y, 7, 4), name: "Independence Day" },
    { date: ymd(y, 9, nth(y, 9, 1, 1)), name: "Labor Day" },
    { date: ymd(y, 10, nth(y, 10, 1, 2)), name: "Indigenous Peoples' Day" },
    { date: ymd(y, 11, 11), name: "Veterans Day" },
    { date: thx, name: "Thanksgiving" },
    { date: ymd(y, 11, td + 1), name: "the day after Thanksgiving" },
    { date: ymd(y, 12, 24), name: "Christmas Eve" },
    { date: ymd(y, 12, 25), name: "Christmas Day" },
    { date: ymd(y, 12, 31), name: "New Year's Eve" },
  ];
}

/** The holiday on this date, if any. */
export const holidayOn = (date: string): string | null => holidays(parse(date)[0]).find(h => h.date === date)?.name || null;

/** Is this date a weekday (Mon–Fri)? */
export const weekday = (date: string) => { const d = dow(...parse(date)); return d >= 1 && d <= 5; };

// 🎓 The school year: term from the second Monday of September to the first Friday of June, with
// a fortnight at Christmas, a week at Thanksgiving and a week in the spring off in between.
export const termEnds = (y: number) => ymd(y, 6, nth(y, 6, 5, 1)); // first Friday of June
export const termStarts = (y: number) => ymd(y, 9, nth(y, 9, 1, 2)); // second Monday of September
/** Spring break: the week from the second Monday of March. */
export const springBreak = (y: number) => ymd(y, 3, nth(y, 3, 1, 2));
/** Thanksgiving break: the whole week, from the Monday before. */
export const thanksgivingBreak = (y: number) => { const [, , d] = parse(thanksgiving(y)); return ymd(y, 11, d - 3); };

/** Why she has no class on this date, or null if it's a normal class day. */
export function noClass(date: string): string | null {
  const [y, m, d] = parse(date);
  // ☀️ Summer: after the first Friday of June until the second Monday of September.
  if (date > termEnds(y) && date < termStarts(y)) return "summer break";
  // 🎄 Christmas: a fortnight, December 20 to January 2.
  if ((m === 12 && d >= 20) || (m === 1 && d <= 2)) return "Christmas break";
  // 🦃 Thanksgiving week, and 🌷 spring break week.
  const start = (s: string) => { const n = daysBetween(s, date); return n >= 0 && n < 7; };
  if (start(thanksgivingBreak(y))) return "Thanksgiving break";
  if (start(springBreak(y))) return "spring break";
  // 🎉 Any other holiday that falls on a weekday (a weekend one changes nothing).
  const h = holidayOn(date);
  if (h && weekday(date)) return h;
  return null;
}

/** What she says about a break, in her own words. */
export function breakNote(reason: string, date: string): string {
  const y = parse(date)[0];
  const back = reason === "summer break" ? termStarts(y) : "";
  const nice = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  if (reason === "summer break") return `🌞 YOU'RE ON SUMMER BREAK — no classes until ${nice(back)}. Your days are your own: more shifts if you work, long mornings, the pool, trips, seeing people. Talk about the summer, not coursework.`;
  if (reason === "Christmas break") return `🎄 YOU'RE OFF CLASS FOR CHRISTMAS BREAK (a fortnight): family, food, lights, late starts. No lectures, no assignments due.`;
  if (reason === "Thanksgiving break") return `🦃 YOU'RE OFF CLASS FOR THANKSGIVING WEEK: family, food, and a whole week with no lectures.`;
  if (reason === "spring break") return `🌷 YOU'RE OFF CLASS FOR SPRING BREAK (this whole week): no lectures — a trip, the sun, or a week of doing very little.`;
  return `🎉 NO CLASS TODAY — it's ${reason}.`;
}

// 🎉 Work on a holiday: most people are off, but somebody always has to cover (nurses, baristas,
// hotels, shops). Who works is settled per person and per holiday, so it never changes mid-chat.
const hash = (s: string) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); };
/** Does she have to work this holiday? (About one in four does.) */
export const worksHoliday = (characterId: string, date: string) => hash(`${characterId}:${date}`) % 100 < 25;
