// Wall-clock time in a person's own IANA time zone, worked out on the server
// with Intl only (no date library). Used by Velo so "today", "this week" and
// "remind me at 3pm" mean the person's local time, not the server's UTC.

/** True for a real IANA zone name such as "America/Chicago" (or "UTC"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string) {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "long",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsFmt.set(tz, f);
  }
  return f;
}

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: string }

/** The calendar date and clock time at instant `ms` in zone `tz`. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const x of fmtFor(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second), weekday: p.weekday,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" in zone `tz` at instant `ms`. */
// The business's home time zone (Central, with daylight saving). Anything the
// server works out without a person's own time zone uses this — never UTC.
export const BUSINESS_TZ = "America/Chicago";

/** Today's date ("YYYY-MM-DD") in Central time. */
export const centralToday = (ms = Date.now()) => localDate(ms, BUSINESS_TZ);

/** "Saturday" for a "YYYY-MM-DD" date. */
export const weekdayOf = (ymd: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: BUSINESS_TZ }).format(new Date(`${ymd}T12:00:00-06:00`));

/** "Oct 4, 2026, 3:05 PM" in Central time. */
export const centralDateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { timeZone: BUSINESS_TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function localDate(ms: number, tz: string): string {
  const z = zonedParts(ms, tz);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}

/** Offset of `tz` from UTC at instant `ms`, in ms (Chicago in summer = -5h). */
export function tzOffsetMs(ms: number, tz: string): number {
  const z = zonedParts(ms, tz);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Converts a local wall-clock time "YYYY-MM-DDTHH:MM" in `tz` to a UTC instant.
 * - A time that happens twice (the hour clocks fall back) resolves to the FIRST one.
 * - A time that never happens (the hour clocks spring forward) moves forward by
 *   the gap, e.g. 2:30 AM on spring-forward day becomes 3:30 AM.
 * Returns null for a malformed or impossible date (Feb 30, 25:00…).
 */
export function zonedToUtc(local: string, tz: string): number | null {
  const m = LOCAL_DT.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(wall);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null; // e.g. Feb 30

  // Try the offsets in force a day either side; keep those that land on the wall time.
  const offsets = [...new Set([tzOffsetMs(wall - 86_400_000, tz), tzOffsetMs(wall, tz), tzOffsetMs(wall + 86_400_000, tz)])];
  const hits = offsets.map(o => wall - o).filter(t => {
    const z = zonedParts(t, tz);
    return z.year === y && z.month === mo && z.day === d && z.hour === h && z.minute === mi;
  });
  if (hits.length) return Math.min(...hits);
  // In a spring-forward gap: use the offset from before the change.
  return wall - tzOffsetMs(wall - 86_400_000, tz);
}

/** "Friday, Oct 9 at 3:00 PM" in `tz`. */
export function formatLocal(ms: number, tz: string): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/** "3:05 PM" in `tz`. */
export function formatClock(ms: number, tz: string): string {
  return new Date(ms).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
}

/**
 * Date line for a document the server builds ("10/4/2026"), from the date the
 * app sent when it's believable (within a day of today in Central time) —
 * otherwise today in Central time.
 */
export function clientDateLabel(raw: unknown, now = Date.now()): string {
  const central = centralToday(now);
  const ymd = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(raw))
    && Math.abs(Date.parse(raw) - Date.parse(central)) <= 86_400_000 ? raw : central;
  const [y, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}/${y}`;
}
