// ⏰ Velo's timed reminders and ✅ to-do list.
// Every query is scoped to the caller's user_id. Reminders pop up in the app when due
// (app/page.tsx polls for them) and list on the Today tab.
import type Anthropic from "@anthropic-ai/sdk";
import type { Caller } from "./caller";
import { zonedToUtc, formatLocal } from "./localTime";
import { sql } from "./db";
import { scrub } from "./secrets";

export const REMINDER_TOOL_NAMES = ["set_reminder", "list_reminders", "cancel_reminder", "add_task", "list_tasks", "complete_task"] as const;
export const isReminderTool = (name: string) => (REMINDER_TOOL_NAMES as readonly string[]).includes(name);
export class ReminderError extends Error {}
const MAX_PENDING = 100;
const YEAR_MS = 366 * 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, n: number) => scrub(String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n));

export const REMINDER_TOOLS: Anthropic.Tool[] = [
  {
    name: "set_reminder",
    description: "Set a timed reminder. At that time it pops up in the Velo app and shows on the Today tab. Give the time as THEIR local wall-clock time; the server converts it using their time zone. Returns the exact local time it was set for — repeat that time back to them. Morning = 8:00 AM, afternoon = 1:00 PM, evening = 6:00 PM unless they say a time.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What to remind them about, short and in their words, e.g. \"Call Mom\"" },
        local_datetime: { type: "string", description: "Local date and time, YYYY-MM-DDTHH:MM (24-hour), e.g. 2026-10-09T15:00" },
      },
      required: ["text", "local_datetime"],
      additionalProperties: false,
    },
  },
  {
    name: "list_reminders",
    description: "Their reminders that are coming up, or due and not yet marked done, with local times and ids.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "cancel_reminder",
    description: "Cancel a reminder (or mark a due one done). Use the reminder_id from list_reminders.",
    input_schema: { type: "object", properties: { reminder_id: { type: "string" } }, required: ["reminder_id"], additionalProperties: false },
  },
  {
    name: "add_task",
    description: "Add something to their to-do list (no set time — use set_reminder for a time). Optional due date.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The to-do, short, e.g. \"Renew passport\"" },
        due_date: { type: "string", description: "Optional YYYY-MM-DD in their local date" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "Their open to-dos (not done yet), with ids and due dates.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "complete_task",
    description: "Mark a to-do done (task_id from list_tasks).",
    input_schema: { type: "object", properties: { task_id: { type: "string" } }, required: ["task_id"], additionalProperties: false },
  },
];

/** Checks a set_reminder request and works out the UTC instant. Pure, for tests. */
export function planReminder(input: Record<string, unknown>, timeZone: string, now = Date.now()) {
  const text = clean(input.text, 300);
  if (!text) throw new ReminderError("text is required — ask them what to remind them about.");
  const at = zonedToUtc(String(input.local_datetime ?? "").trim(), timeZone);
  if (at === null) throw new ReminderError("local_datetime must be a real date and time as YYYY-MM-DDTHH:MM.");
  if (at <= now) throw new ReminderError(`That time (${formatLocal(at, timeZone)}) has already passed. Ask for a later time.`);
  if (at - now > YEAR_MS) throw new ReminderError("Reminders can be set up to a year ahead. Ask for an earlier date.");
  return { text, remindAt: at, when: formatLocal(at, timeZone) };
}

export async function runReminderTool(c: Caller, name: string, input: unknown, timeZone: string): Promise<unknown> {
  const args = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const db = sql();

  if (name === "set_reminder") {
    const plan = planReminder(args, timeZone);
    const [{ n }] = await db`select count(*)::int as n from velo_reminders where user_id = ${c.userId} and status = 'pending'`;
    if (n >= MAX_PENDING) throw new ReminderError(`They already have ${MAX_PENDING} reminders waiting. Ask them to clear some first.`);
    const [row] = await db`insert into velo_reminders (user_id, text, remind_at, time_zone)
      values (${c.userId}, ${plan.text}, ${new Date(plan.remindAt).toISOString()}, ${timeZone}) returning id`;
    return { ok: true, reminder_id: row.id, text: plan.text, local_time: plan.when, tell_them: `Confirm with this exact time, e.g. "Got it — ${plan.when} I'll remind you to ${plan.text}."` };
  }

  if (name === "list_reminders") {
    const rows = await db`select id, text, remind_at from velo_reminders where user_id = ${c.userId} and status in ('pending', 'sent') order by remind_at limit 30`;
    const now = Date.now();
    const list = rows.map(r => {
      const at = new Date(r.remind_at as string | Date).getTime();
      return { reminder_id: r.id, text: r.text, local_time: formatLocal(at, timeZone), state: at <= now ? "due (not marked done)" : "upcoming" };
    });
    return list.length ? { reminders: list } : { result: "No reminders set." };
  }

  if (name === "cancel_reminder") {
    const id = String(args.reminder_id || "");
    if (!UUID.test(id)) throw new ReminderError("reminder_id must come from list_reminders.");
    const rows = await db`update velo_reminders set status = 'dismissed' where id = ${id} and user_id = ${c.userId} and status in ('pending', 'sent') returning text`;
    return rows.length ? { ok: true, cancelled: rows[0].text } : { result: "That reminder wasn't found (it may already be done)." };
  }

  if (name === "add_task") {
    const text = clean(args.text, 300);
    if (text.length < 2) throw new ReminderError("Say what the to-do is.");
    const due = typeof args.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) && !isNaN(Date.parse(args.due_date)) ? args.due_date : null;
    const [{ n }] = await db`select count(*)::int as n from velo_tasks where user_id = ${c.userId} and done = false`;
    if (n >= 200) throw new ReminderError("Their to-do list is full (200 open). Ask them to finish or clear some first.");
    const [row] = await db`insert into velo_tasks (user_id, text, due_date) values (${c.userId}, ${text}, ${due}) returning id`;
    return { ok: true, task_id: row.id, text, due_date: due, tell_them: "Confirm briefly that it's on their to-do list." };
  }

  if (name === "list_tasks") {
    const rows = await db`select id, text, due_date::text as due_date from velo_tasks where user_id = ${c.userId} and done = false order by created_at limit 50`;
    return rows.length ? { tasks: rows.map(t => ({ task_id: t.id, text: t.text, due_date: t.due_date })) } : { result: "Their to-do list is empty." };
  }

  if (name === "complete_task") {
    const id = String(args.task_id || "");
    if (!UUID.test(id)) throw new ReminderError("task_id must come from list_tasks.");
    const rows = await db`update velo_tasks set done = true, done_at = now() where id = ${id} and user_id = ${c.userId} returning text`;
    return rows.length ? { ok: true, done: rows[0].text } : { result: "That to-do wasn't found." };
  }

  throw new ReminderError(`Unknown tool ${name}`);
}
