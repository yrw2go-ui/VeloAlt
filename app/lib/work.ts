// 💼 A character's work week: which days, what hours (her own time zone), part-time or full-time, and
// what she wears to work. She knows where she is right now ("at work till 6", "off today") and texts
// like it; photos during work hours show her in her work clothes.
import { zonedParts, localDate } from "./localTime";
import { noClass, breakNote, holidayOn, worksHoliday } from "./holidays";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export type Work = { job?: string; work_attire?: string; work_days?: number[] | null; work_start?: string; work_end?: string; part_time?: boolean;
  // 🎓 Her classes, if she studies: their own days and hours, and where.
  school?: string; class_days?: number[] | null; class_start?: string; class_end?: string };
const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
const hasHours = (w: Work) => !!(w.work_start && w.work_end);
const days = (w: Work) => (Array.isArray(w.work_days) ? w.work_days.filter(d => d >= 0 && d <= 6) : []);
// 🎓 Her timetable as its own little schedule, so one function can read either.
const asClass = (w: Work): Work => ({ work_days: w.class_days, work_start: w.class_start, work_end: w.class_end });
const hasClass = (w: Work) => !!(w.class_start && w.class_end && days(asClass(w)).length);

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
  const ds = days(w), cs = days(asClass(w));
  if (!ds.length && !hasHours(w) && !w.work_attire && !cs.length && !w.school) return "";
  const parts = [
    ds.length ? `YOUR WORK WEEK (${w.part_time ? "part-time" : "full-time"}): ${dayList(ds)}${hasHours(w) ? `, ${clock12(w.work_start!)}–${clock12(w.work_end!)}` : ""}; off ${DAYS.filter((_, i) => !ds.includes(i)).join(", ") || "no days"}.` : hasHours(w) ? `YOUR WORK HOURS: ${clock12(w.work_start!)}–${clock12(w.work_end!)}.` : "",
    w.work_attire ? `WHAT YOU WEAR TO WORK: ${w.work_attire}` : "",
    cs.length ? `YOUR CLASSES${w.school ? ` (${w.school})` : ""}: ${dayList(cs)}${hasClass(w) ? `, ${clock12(w.class_start!)}–${clock12(w.class_end!)}` : ""}; no classes ${DAYS.filter((_, i) => !cs.includes(i)).join(", ") || "no days"}. Live the term: assignments, a test coming up, a lecture that dragged, people on your course. The school year runs from the second Monday of September to the first Friday of June, with a fortnight off at Christmas, the whole week of Thanksgiving, a week of spring break in March, and no class on holidays that fall on a weekday. The summer in between is your long break.` : w.school ? `YOU STUDY AT: ${w.school}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

// 🎓 Class, not work: a student's "shift" is her timetable, so the app says class and the chip is orange.
const SCHOOL = /\b(student|school|college|university|classes?|coursework|lectures?|semester|campus|nursing school|law school|grad school|undergrad|phd|studying)\b/i;
export const inClass = (w: Work) => SCHOOL.test(`${w.job || ""} ${w.work_attire || ""}`);

/** On summer break with a job as well: work decides her day, and she mentions the break. */
function termOff(w: Work, zone: string, now: number, reason: string): { atWork: boolean; text: string; kind?: "work" | "class" } {
  const r = workNow({ ...w, class_days: [], class_start: "", class_end: "" }, zone, now, false, undefined);
  return { ...r, text: [breakNote(reason, localDate(now, zone)), r.text].filter(Boolean).join("\n") };
}

/** Is she inside this schedule's hours right now? */
function within(w: Work, zone: string, now: number): boolean {
  const ds = days(w);
  if (!ds.length || !hasHours(w)) return false;
  const p = zonedParts(now, zone);
  const today = DAYS.indexOf(p.weekday), yesterday = (today + 6) % 7, t = p.hour * 60 + p.minute;
  const s = mins(w.work_start!), e = mins(w.work_end!), overnight = e <= s;
  return (ds.includes(today) && (overnight ? t >= s : t >= s && t < e)) || (overnight && ds.includes(yesterday) && t < e);
}

/** Where her classes are up to today, when she isn't in one right now. */
function classLater(w: Work, zone: string, now: number): string {
  const cs = days(asClass(w));
  const p = zonedParts(now, zone);
  const today = DAYS.indexOf(p.weekday), t = p.hour * 60 + p.minute;
  const s = mins(w.class_start!), start = clock12(w.class_start!), end = clock12(w.class_end!);
  if (cs.includes(today) && t < s) return `You have class today from ${start} to ${end} — it hasn't started yet.`;
  if (cs.includes(today)) return `Your classes are done for today (they finished at ${end}).`;
  const next = [1, 2, 3, 4, 5, 6, 7].map(k => (today + k) % 7).find(d => cs.includes(d));
  return `No classes today (${DAYS[today]}).${next !== undefined ? ` Next class: ${next === (today + 1) % 7 ? "tomorrow" : DAYS[next]} at ${start}.` : ""}`;
}

/** Where she is in her work day right now, in her own time zone (empty if no schedule).
 *  `off` is a day she called off work or skipped class: then she's nowhere she's meant to be. */
export function workNow(w: Work, zone: string, now = Date.now(), off = false, characterId?: string): { atWork: boolean; text: string; kind?: "work" | "class" } {
  // 🎓 Classes first: if she's in a lecture right now, that's where she is (term time only).
  const localDay = localDate(now, zone);
  const away = hasClass(w) ? noClass(localDay) : null;
  if (away) return days(w).length && hasHours(w) ? termOff(w, zone, now, away) : { atWork: false, kind: "class", text: breakNote(away, localDay) };
  if (hasClass(w)) {
    const inIt = within(asClass(w), zone, now);
    if (inIt && !off) return { atWork: true, kind: "class", text: `RIGHT NOW YOU'RE IN CLASS${w.school ? ` at ${w.school}` : ""} (until ${clock12(w.class_end!)}). Text like someone in a lecture: short replies, phone under the desk, a bit distracted — but you still answer. Mention the class when it fits, and when you're out. Any photo of you right now is on campus.` };
    if (inIt && off) return { atWork: false, kind: "class", text: `YOU SKIPPED CLASS TODAY to be free for them — you're not on campus, and you know you'll have to catch up.` };
  }
  const ds = days(w);
  if (!ds.length || !hasHours(w)) {
    // No job, but she does have classes: say where her day is up to.
    if (hasClass(w)) return { atWork: false, kind: "class", text: classLater(w, zone, now) };
    return { atWork: false, text: "" };
  }
  // 🎉 A holiday: most of them have the day off, and somebody always has to cover.
  const feast = holidayOn(localDay);
  if (feast && characterId && !worksHoliday(characterId, localDay)) {
    return { atWork: false, kind: "work", text: `🎉 IT'S ${feast.toUpperCase()} — you're off work today. Talk about it the way you would: who you're with, what's cooking, the traditions, or how quiet it is.` };
  }
  const holidayShift = feast ? `\n🎉 It's ${feast} and you're working it (somebody has to) — mention that when it fits: the holiday pay, the skeleton crew, missing the family thing.` : "";
  const school = inClass(w) && !hasClass(w);
  if (off) return { atWork: false, kind: school ? "class" : "work", text: school ? `YOU SKIPPED CLASS TODAY to be free for them — you're not on campus, and you know you'll have to catch up.` : `YOU CALLED OFF WORK TODAY to be free for them — you're not at work, and nobody there expects you.` };
  const p = zonedParts(now, zone);
  const today = DAYS.indexOf(p.weekday), yesterday = (today + 6) % 7, t = p.hour * 60 + p.minute;
  const s = mins(w.work_start!), e = mins(w.work_end!), overnight = e <= s;
  const end = clock12(w.work_end!), start = clock12(w.work_start!);
  const working = ds.includes(today) && (overnight ? t >= s : t >= s && t < e) || (overnight && ds.includes(yesterday) && t < e);
  if (working) return { atWork: true, kind: school ? "class" : "work", text: holidayShift + (school
    ? `RIGHT NOW YOU'RE IN CLASS (until ${end}). Text like someone in a lecture: short replies, phone under the desk, a bit distracted — but you still answer. Mention the class when it fits, and when you're out. Any photo of you right now is on campus.`
    : `RIGHT NOW YOU'RE AT WORK (until ${end}). Text like someone at work: shorter replies, on a break or between tasks, maybe a little distracted — but you still answer. Mention you're at work when it fits, and what time you get off. Any photo of you right now is at work, in your work clothes.`) };
  if (ds.includes(today) && t < s) return { atWork: false, text: school ? `You have class today from ${start} to ${end} — it hasn't started yet.` : `You work today from ${start} to ${end} — you haven't started yet.` };
  if (ds.includes(today)) return { atWork: false, text: school ? `Your classes are done for today (they finished at ${end}).` : `You already got off work today (at ${end}).` };
  const next = [1, 2, 3, 4, 5, 6, 7].map(k => (today + k) % 7).find(d => ds.includes(d));
  return { atWork: false, text: `You're off ${school ? "class" : "work"} today (${DAYS[today]}).${next !== undefined ? ` Next ${school ? "class" : "shift"}: ${next === (today + 1) % 7 ? "tomorrow" : DAYS[next]} at ${start}.` : ""}` };
}
