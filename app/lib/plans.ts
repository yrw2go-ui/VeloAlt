// 📅 Plans: when a character and the person agree on a hangout or date for a day, the character
// saves it (plan_hangout). On that day the chat shows a card — and a push goes out, if they have
// notifications on — asking them to describe the scene, so it can be played out (or told).
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { isValidTimeZone, localDate, zonedParts } from "./localTime";
import { sendPush } from "./push";

export type Plan = { id: string; title: string; details: string; day: string; time?: string };

export const PLAN_TOOL: Anthropic.Tool = {
  name: "plan_hangout",
  description: "Save a hangout or date you two just agreed on for a specific day (e.g. dinner Friday, the beach on Saturday) — only once you've BOTH agreed on it and the day is clear. On that day they'll be asked to set the scene so you can play it out together. Don't use it for vague someday ideas, and don't save the same plan twice.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name, e.g. \"Dinner date at a little Italian place\"" },
      day: { type: "string", description: "The day, YYYY-MM-DD (today or later, within a year)" },
      details: { type: "string", description: "Anything already decided: place, what you'll do or wear" },
      time: { type: "string", description: "The time you agreed on, if any, as HH:MM (24-hour), e.g. 17:00" },
    },
    required: ["title", "day"],
    additionalProperties: false,
  },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export async function runPlanTool(userId: string, characterId: string, input: unknown, today: string): Promise<{ ok?: boolean; tell_them?: string; error?: string }> {
  const i = (input || {}) as { title?: unknown; day?: unknown; details?: unknown; time?: unknown };
  const at = typeof i.time === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(i.time.trim()) ? i.time.trim() : "";
  const title = String(i.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const day = String(i.day || "").trim();
  const details = String(i.details || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!title) return { error: "Give the plan a short name." };
  if (!DAY.test(day) || Number.isNaN(Date.parse(day))) return { error: "Give the day as YYYY-MM-DD." };
  const max = new Date(Date.parse(today) + 366 * 86400_000).toISOString().slice(0, 10);
  if (day < today || day > max) return { error: `That day must be between ${today} and ${max}.` };
  const [dupe] = await sql()`select id from chat_plans where user_id = ${userId} and character_id = ${characterId} and day = ${day} and status = 'planned' limit 1`;
  if (dupe) await sql()`update chat_plans set title = ${title}, details = ${details}, at_time = ${at} where id = ${dupe.id}`;
  else {
    const [{ n }] = await sql()`select count(*)::int as n from chat_plans where user_id = ${userId} and character_id = ${characterId} and status = 'planned'`;
    if (n >= 10) return { error: "You already have plenty of plans with them — no need to save more right now." };
    await sql()`insert into chat_plans (user_id, character_id, title, details, day, at_time) values (${userId}, ${characterId}, ${title}, ${details}, ${day}, ${at})`;
  }
  return { ok: true, tell_them: `Saved for ${day}. On that day they'll be asked to set the scene. Don't mention the app or this tool — just be glad it's a plan.` };
}

/** Upcoming plans with this character, for the prompt. */
export async function plansNote(userId: string, characterId: string, today: string): Promise<string> {
  const rows = await sql()`select title, details, day::text, at_time from chat_plans where user_id = ${userId} and character_id = ${characterId} and status = 'planned' and day >= ${today} order by day limit 6`;
  if (!rows.length) return "";
  return "PLANS YOU TWO HAVE MADE: " + rows.map(r => `${r.day === today ? "TODAY" : r.day}${r.at_time ? ` at ${r.at_time}` : ""}: ${r.title}${r.details ? ` (${r.details})` : ""}`).join("; ") + ". Look forward to them; if one is today, you can mention it.";
}

/** Plans whose day has come (today, or up to 2 days ago and not yet played), for this chat. */
export async function duePlans(userId: string, characterId: string, today: string): Promise<Plan[]> {
  const rows = await sql()`select id, title, details, day::text, at_time from chat_plans where user_id = ${userId} and character_id = ${characterId}
    and status = 'planned' and day <= ${today} and day >= ${today}::date - 2 order by day limit 3`;
  return rows.map(r => ({ id: String(r.id), title: String(r.title), details: String(r.details), day: String(r.day), time: String(r.at_time || "") }));
}

export async function setPlanStatus(userId: string, planId: string, status: "done" | "skipped"): Promise<boolean> {
  const rows = await sql()`update chat_plans set status = ${status} where id = ${planId} and user_id = ${userId} and status = 'planned' returning id`;
  return rows.length > 0;
}

/** 🔔 The day of a plan (from 9am their time): one push asking them to set the scene. */
export async function planNudges(): Promise<number> {
  const rows = await sql()`select p.id, p.user_id, p.character_id, p.title, p.day::text, u.time_zone, c.name, f.url as portrait_url from chat_plans p
    join users u on u.id = p.user_id join chat_characters c on c.id = p.character_id left join velo_files f on f.id = c.portrait_file_id
    where p.status = 'planned' and p.notified_at is null and p.day between current_date - 1 and current_date + 1
      and exists (select 1 from push_subscriptions s where s.user_id = p.user_id) limit 200`;
  let sent = 0;
  for (const r of rows) {
    const tz = isValidTimeZone(r.time_zone) ? r.time_zone : "America/Chicago";
    if (localDate(Date.now(), tz) !== r.day || zonedParts(Date.now(), tz).hour < 9) continue;
    try {
      await sql()`update chat_plans set notified_at = now() where id = ${r.id}`;
      await sendPush(String(r.user_id), { title: `📅 Today: ${r.title}`, body: `Set the scene for your plans with ${r.name} — then play it out together.`, url: `/?chat=${r.character_id}`, icon: r.portrait_url || "/icon-192.png", tag: `plan-${r.id}` });
      sent++;
    } catch (e) { console.error("plans: nudge", e instanceof Error ? e.message : e); }
  }
  return sent;
}
