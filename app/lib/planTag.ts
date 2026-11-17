// 📅 A quiet reminder of what you two have on, tucked under the odd message: "Tonight, in person —
// dinner by the river, 6:00 PM". It shows a few times a day, not on every message, and turns into
// a 🚨 in the last hour before it starts.

export type Plan = { title: string; details: string; day: string; at_time: string; kind: string };
export type PlanTag = { text: string; urgent: boolean };

const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mins = (hhmm: string) => (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)));

/** "Tonight, in person — dinner by the river, 6:00 PM" */
export function planLabel(p: Plan, today: string): string {
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tom = tomorrow.toISOString().slice(0, 10);
  const evening = !!p.at_time && mins(p.at_time) >= 17 * 60;
  const when = p.day === today ? (evening ? "Tonight" : "Today")
    : p.day === tom ? (evening ? "Tomorrow night" : "Tomorrow")
    : WEEKDAYS[new Date(`${p.day}T12:00:00Z`).getUTCDay()];
  const what = p.kind === "person" ? "in person" : "video chat";
  const bits = [p.title.trim(), p.details.trim(), p.at_time ? clock12(p.at_time) : ""].filter(Boolean);
  return `${when}, ${what} — ${bits.join(", ")}`;
}

/** 🚨 The last hour before it starts (and while it's only just begun). */
export function isUrgent(p: Plan, today: string, now: string): boolean {
  if (p.day !== today || !p.at_time) return false;
  const left = mins(p.at_time) - mins(now);
  return left <= 60 && left >= -15;
}

/** Which of her messages carry the reminder: the first one in each three-hour stretch of the day,
 *  so it's there a few times rather than every time — and every message once it's urgent. */
export function tagged(ids: { id: string; role: string; at: string }[], urgentFrom: number | null, nowMs: number): Set<string> {
  const out = new Set<string>();
  const seen = new Set<number>();
  for (const m of ids) {
    if (m.role !== "assistant") continue;
    const t = Date.parse(m.at);
    if (!Number.isFinite(t) || nowMs - t > 20 * 3600_000) continue; // only today's messages
    if (urgentFrom !== null && t >= urgentFrom) { out.add(m.id); continue; }
    const block = Math.floor(t / (3 * 3600_000));
    if (seen.has(block)) continue;
    seen.add(block);
    out.add(m.id);
  }
  return out;
}
