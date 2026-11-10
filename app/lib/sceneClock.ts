// 🕒 A scene's clock. "Now": it happens in real time (their time zone) — if it was planned for another
// time she knows it got pushed back (fine, unless it keeps happening). "Scheduled": the scene keeps
// its own clock, starting at the set time and moving on as it's played; she never knows it's out of sync.
import { partOfDay } from "./calendar";
import { zonedParts } from "./localTime";
import { clock12 } from "./work";

export type SceneClock = { clock?: string; set_time?: string; planned_time?: string; started_at?: string };
export const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const hhmm = (t: number) => `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

/** The time it is IN the scene right now: "6:10 PM — evening". */
export function sceneTime(s: SceneClock, tz: string, now = Date.now()): { hhmm: string; label: string; set: boolean } {
  if (s.clock === "set" && s.set_time && HHMM.test(s.set_time)) {
    const gone = s.started_at ? Math.max(0, Math.floor((now - Date.parse(s.started_at)) / 60000)) : 0;
    const t = (mins(s.set_time) + gone) % 1440;
    return { hhmm: hhmm(t), label: `${clock12(hhmm(t))} — ${partOfDay(Math.floor(t / 60))}`, set: true };
  }
  const p = zonedParts(now, tz), t = p.hour * 60 + p.minute;
  return { hhmm: hhmm(t), label: `${clock12(hhmm(t))} — ${partOfDay(p.hour)}`, set: false };
}

/** For her instructions: what time it is in the scene, and (real time) whether it got pushed back. */
export function sceneClockNote(s: SceneClock, tz: string, pushedLately = 0): string {
  const t = sceneTime(s, tz);
  if (t.set) return `🕒 SCENE TIME: it's ${t.label} in the scene. The scene keeps its own clock — use this time for everything in it (the light, what's open, being hungry or tired), whatever any other clock says.`;
  let note = `🕒 It's happening right now, in real time: ${t.label}.`;
  if (s.planned_time && HHMM.test(s.planned_time) && Math.abs(mins(t.hhmm) - mins(s.planned_time)) >= 60) {
    note += ` You'd planned it for ${clock12(s.planned_time)}, so you know it got moved to now. ${pushedLately >= 3 ? "Plans with them have been getting pushed around a lot lately — you're a little annoyed about it, in your own way (not cruel), though you're still glad to be here." : "You don't really mind — at most a light, playful comment about it."}`;
  }
  return note;
}
