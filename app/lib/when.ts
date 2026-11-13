// 🕒 When something was said, sent or posted — the same small line everywhere in the app:
// "Today 11:35 AM · Nov 13, 2026", "Yesterday 9:02 PM · Nov 12, 2026", "Mon 4:10 PM · Nov 10, 2026".
const TIME = { hour: "numeric", minute: "2-digit" } as const;
const DATE = { month: "short", day: "numeric", year: "numeric" } as const;

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Postgres hands back "2026-11-13 17:41:26.35+00"; browsers want "2026-11-13T17:41:26.35+00:00". */
function iso(at: string): string {
  const t = at.trim().replace(" ", "T");
  if (/[zZ]$/.test(t)) return t;
  if (/[+-]\d\d:\d\d$/.test(t)) return t;
  if (/[+-]\d{4}$/.test(t)) return `${t.slice(0, -2)}:${t.slice(-2)}`;
  if (/[+-]\d\d$/.test(t)) return `${t}:00`;
  return `${t}Z`;
}

/** The stamp for a moment, in the reader's own time zone. Empty when there's no time to show. */
export function stamp(at?: string | number | Date | null): string {
  if (!at && at !== 0) return "";
  const d = at instanceof Date ? at : typeof at === "number" ? new Date(at) : new Date(iso(at));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const day = ymd(d) === ymd(now) ? "Today" : ymd(d) === ymd(yesterday) ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${d.toLocaleTimeString(undefined, TIME)} · ${d.toLocaleDateString(undefined, DATE)}`;
}
