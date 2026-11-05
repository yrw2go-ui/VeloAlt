// 📅 Calendar sense for Velo and characters: part of day, season, upcoming US holidays
// (and Election Day in election years), and birthdays. Pure date math — no news feed.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTHS[m - 1];

export function partOfDay(hour: number): string {
  if (hour < 5) return "the middle of the night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}
function season(month: number): string {
  return month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall";
}

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
/** The nth weekday (0=Sun) of a month; n = -1 for the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) { const first = new Date(utc(y, m, 1)).getUTCDay(); return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7; }
  const lastDay = new Date(utc(y, m + 1, 0)).getUTCDate(), lastWd = new Date(utc(y, m, lastDay)).getUTCDay();
  return lastDay - ((lastWd - weekday + 7) % 7);
}
function easter(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

/** US holidays and notable days in a year, as [month, day, name]. */
export function holidays(y: number): [number, number, string][] {
  const [em, ed] = easter(y);
  const list: [number, number, string][] = [
    [1, 1, "New Year's Day"], [1, nthWeekday(y, 1, 1, 3), "Martin Luther King Jr. Day"], [2, 14, "Valentine's Day"],
    [2, nthWeekday(y, 2, 1, 3), "Presidents' Day"], [3, 17, "St. Patrick's Day"], [em, ed, "Easter"],
    [5, nthWeekday(y, 5, 0, 2), "Mother's Day"], [5, nthWeekday(y, 5, 1, -1), "Memorial Day"], [6, nthWeekday(y, 6, 0, 3), "Father's Day"],
    [6, 19, "Juneteenth"], [7, 4, "Independence Day (Fourth of July)"], [9, nthWeekday(y, 9, 1, 1), "Labor Day"], [10, 31, "Halloween"],
    [11, 11, "Veterans Day"], [11, nthWeekday(y, 11, 4, 4), "Thanksgiving"], [12, 24, "Christmas Eve"], [12, 25, "Christmas"], [12, 31, "New Year's Eve"],
  ];
  // Election Day: the Tuesday after the first Monday in November, in even years.
  if (y % 2 === 0) list.push([11, nthWeekday(y, 11, 1, 1) + 1, y % 4 === 0 ? "Election Day (US presidential election)" : "Election Day (US midterm elections)"]);
  return list.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

/** Days from today (YYYY-MM-DD) to a date (negative = already passed). */
const diff = (today: string, y: number, m: number, d: number) => { const [ty, tm, td] = today.split("-").map(Number); return Math.round((utc(y, m, d) - utc(ty, tm, td)) / 86_400_000); };
/** Days to the next occurrence of a month/day (0 = today). */
function daysUntil(today: string, m: number, d: number): number {
  const y = Number(today.slice(0, 4)), n = diff(today, y, m, d);
  return n >= 0 ? n : diff(today, y + 1, m, d);
}
const when = (n: number) => (n === 0 ? "TODAY" : n === 1 ? "tomorrow" : n === -1 ? "was yesterday" : n < 0 ? `was ${-n} days ago` : `in ${n} days`);

/** A short calendar note for the instructions: season, what just happened, what's today and coming up. */
export function calendarNote(today: string, canSearch = false): string {
  const [y, m] = today.split("-").map(Number);
  const near = [...holidays(y - 1).map(h => [y - 1, ...h] as const), ...holidays(y).map(h => [y, ...h] as const), ...holidays(y + 1).map(h => [y + 1, ...h] as const)]
    .map(([hy, hm, hd, name]) => ({ name, n: diff(today, hy, hm, hd) }))
    .filter(h => h.n >= -3 && h.n <= 30)
    .sort((a, b) => a.n - b.n);
  const parts = [`It's ${season(m)}, ${monthName(m)} ${y}.`];
  const past = near.filter(h => h.n < 0), next = near.filter(h => h.n >= 0);
  if (past.length) parts.push(`Recently: ${past.map(h => `${h.name} ${when(h.n)}`).join("; ")}.`);
  if (next.length) parts.push(`Coming up: ${next.map(h => `${h.name} ${when(h.n)}`).join("; ")}.`);
  return `CALENDAR: ${parts.join(" ")} Mention a holiday only when it fits naturally (a greeting on the day, plans, a little excitement) — not every message. ${canSearch ? "For current events and news, search the web before answering." : "You don't follow live news, so if they ask about current events, share what you know and say it may be out of date."}`;
}

/** A character's own birthday ("MM-DD"), relative to today. */
export function ownBirthdayNote(birthday: string, today: string): string {
  if (!/^\d{2}-\d{2}$/.test(birthday)) return "";
  const [m, d] = birthday.split("-").map(Number), n = daysUntil(today, m, d);
  return `YOUR BIRTHDAY: ${monthName(m)} ${d}${n === 0 ? " — it's TODAY! You can be excited about it (once, naturally)" : n <= 14 ? ` — ${when(n)}` : ""}.`;
}
