// 📅 The little reminder of what you two have on.
import { planLabel, isUrgent, tagged } from "../app/lib/planTag.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const today = "2026-11-17";
const plan = { title: "date", details: "Chicago", day: today, at_time: "18:00", kind: "person" };

ok(planLabel(plan, today) === "Tonight, in person — date, Chicago, 6:00 PM", `an evening plan today reads "${planLabel(plan, today)}"`);
ok(planLabel({ ...plan, at_time: "11:30" }, today) === "Today, in person — date, Chicago, 11:30 AM", "a daytime one says Today");
ok(planLabel({ ...plan, day: "2026-11-18" }, today) === "Tomorrow night, in person — date, Chicago, 6:00 PM", "tomorrow evening says Tomorrow night");
ok(planLabel({ ...plan, day: "2026-11-21" }, today).startsWith("Saturday, in person"), "further off, it names the day");
ok(planLabel({ ...plan, kind: "video" }, today).includes("video chat"), "a video chat says so");
ok(planLabel({ ...plan, details: "", at_time: "" }, today) === "Today, in person — date", "nothing is made up when there's no time or place");

// 🚨 The last hour.
ok(!isUrgent(plan, today, "15:00"), "three hours out, it's just a note");
ok(isUrgent(plan, today, "17:05"), "under an hour, it's urgent");
ok(isUrgent(plan, today, "18:00"), "…and right on the hour");
ok(isUrgent(plan, today, "18:10"), "…and just after it starts");
ok(!isUrgent(plan, today, "18:30"), "…but not long after");
ok(!isUrgent({ ...plan, day: "2026-11-18" }, today, "17:30"), "tomorrow's plan is never urgent today");
ok(!isUrgent({ ...plan, at_time: "" }, today, "17:30"), "nor one with no time at all");

// 🔁 Which messages carry it.
const now = Date.parse("2026-11-17T18:00:00Z");
const h = (n: number) => new Date(now - n * 3600_000).toISOString();
const msgs = [
  { id: "a", role: "assistant", at: h(9) }, { id: "b", role: "assistant", at: h(8.5) },
  { id: "c", role: "user", at: h(8) }, { id: "d", role: "assistant", at: h(5) },
  { id: "e", role: "assistant", at: h(1) }, { id: "f", role: "assistant", at: h(0.2) },
];
const few = tagged(msgs, null, now);
ok(few.size >= 2 && few.size <= 4, `it shows a few times a day, not every message (${few.size} of 5 of hers)`);
ok(!few.has("c"), "never on one of yours");
ok(few.has("a") && !few.has("b"), "the first of each stretch carries it, not the next one");
const all = tagged(msgs, now - 3600_000, now);
ok(all.has("e") && all.has("f"), "in the last hour every message of hers carries it");
ok(tagged([{ id: "old", role: "assistant", at: h(30) }], null, now).size === 0, "yesterday's messages are left alone");
