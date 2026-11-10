// 💼 A character's work week: which days, what hours (her own time zone), part-time or full-time, and
// what she wears to work. She knows where she is right now ("at work till 6", "off today") and texts
// like it; photos during work hours show her in her work clothes.
import { zonedParts } from "./localTime";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export type Work = { job?: string; work_attire?: string; work_days?: number[] | null; work_start?: string; work_end?: string; part_time?: boolean };
const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
const hasHours = (w: Work) => !!(w.work_start && w.work_end);
const days = (w: Work) => (Array.isArray(w.work_days) ? w.work_days.filter(d => d >= 0 && d <= 6) : []);

/** "Monday–Wednesday, Friday" (runs of days joined). */
export function dayList(ds: number[]): string {
  const s = [...new Set(ds)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    runs.push(j - i >= 2 ? `${DAYS[s[i]]}–${DAYS[s[j]]}` : s.slice(i, j + 1).map(d => DAYS[d]).join(", "));
    i = j;
  }
  return runs.join(", ");
}

/** Her standing schedule, for her persona (empty if none is set). */
export function scheduleText(w: Work): string {
  const ds = days(w);
  if (!ds.length && !hasHours(w) && !w.work_attire) return "";
  const parts = [
    ds.length ? `YOUR WORK WEEK (${w.part_time ? "part-time" : "full-time"}): ${dayList(ds)}${hasHours(w) ? `, ${clock12(w.work_start!)}–${clock12(w.work_end!)}` : ""}; off ${DAYS.filter((_, i) => !ds.includes(i)).join(", ") || "no days"}.` : hasHours(w) ? `YOUR WORK HOURS: ${clock12(w.work_start!)}–${clock12(w.work_end!)}.` : "",
    w.work_attire ? `WHAT YOU WEAR TO WORK: ${w.work_attire}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

/** Where she is in her work day right now, in her own time zone (empty if no schedule). */
export function workNow(w: Work, zone: string, now = Date.now()): { atWork: boolean; text: string } {
  const ds = days(w);
  if (!ds.length || !hasHours(w)) return { atWork: false, text: "" };
  const p = zonedParts(now, zone);
  const today = DAYS.indexOf(p.weekday), yesterday = (today + 6) % 7, t = p.hour * 60 + p.minute;
  const s = mins(w.work_start!), e = mins(w.work_end!), overnight = e <= s;
  const end = clock12(w.work_end!), start = clock12(w.work_start!);
  const working = ds.includes(today) && (overnight ? t >= s : t >= s && t < e) || (overnight && ds.includes(yesterday) && t < e);
  if (working) return { atWork: true, text: `RIGHT NOW YOU'RE AT WORK (until ${end}). Text like someone at work: shorter replies, on a break or between tasks, maybe a little distracted — but you still answer. Mention you're at work when it fits, and what time you get off. Any photo of you right now is at work, in your work clothes.` };
  if (ds.includes(today) && t < s) return { atWork: false, text: `You work today from ${start} to ${end} — you haven't started yet.` };
  if (ds.includes(today)) return { atWork: false, text: `You already got off work today (at ${end}).` };
  const next = [1, 2, 3, 4, 5, 6, 7].map(k => (today + k) % 7).find(d => ds.includes(d));
  return { atWork: false, text: `You're off work today (${DAYS[today]}).${next !== undefined ? ` Next shift: ${next === (today + 1) % 7 ? "tomorrow" : DAYS[next]} at ${start}.` : ""}` };
}
