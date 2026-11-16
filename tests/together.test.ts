// 🧍🎥 Two times together at a time, and no days passing while you're in one.
import { timeOfDay } from "../app/lib/localTime.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const full = "Wednesday, November 4, 2026 (2026-11-04), 7:20 PM — evening (time zone America/Chicago)";
ok(timeOfDay(full) === "7:20 PM — evening", `while you're together she gets the clock, not the calendar (${timeOfDay(full)})`);
ok(!/Wednesday|November|2026|time zone/.test(timeOfDay(full)), "no weekday, no date, no time zone");
ok(timeOfDay("8:05 AM — morning") === "8:05 AM — morning", "something already plain comes through untouched");
