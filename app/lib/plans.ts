// 📅 Plans: when a character and the person agree on a hangout or date for a day, the character
// saves it (plan_hangout). On that day the chat shows a card — and a push goes out, if they have
// notifications on — asking them to describe the scene, so it can be played out (or told).
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "./db";
import { isValidTimeZone, localDate, zonedParts } from "./localTime";
import { sendPush } from "./push";

export type PlanKind = "video" | "person";
export type Plan = { id: string; title: string; details: string; day: string; time?: string; kind: PlanKind; character_id?: string; who?: string; portrait?: string | null };

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
      kind: { type: "string", enum: ["video", "person"], description: "How you'll be together: \"person\" if you're actually meeting up (dinner, the beach, their place), \"video\" if it's a video chat. Pick what you two actually agreed on." },
    },
    required: ["title", "day"],
    additionalProperties: false,
  },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export async function runPlanTool(userId: string, characterId: string, input: unknown, today: string): Promise<{ ok?: boolean; tell_them?: string; error?: string }> {
  const i = (input || {}) as { title?: unknown; day?: unknown; details?: unknown; time?: unknown; kind?: unknown };
  const kind = i.kind === "person" ? "person" : "video";
  const at = typeof i.time === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(i.time.trim()) ? i.time.trim() : "";
  const title = String(i.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const day = String(i.day || "").trim();
  const details = String(i.details || "").replace(/\s+/g, " ").trim().slice(0, 600);
  if (!title) return { error: "Give the plan a short name." };
  if (!DAY.test(day) || Number.isNaN(Date.parse(day))) return { error: "Give the day as YYYY-MM-DD." };
  const max = new Date(Date.parse(today) + 366 * 86400_000).toISOString().slice(0, 10);
  if (day < today || day > max) return { error: `That day must be between ${today} and ${max}.` };
  const [dupe] = await sql()`select id from chat_plans where user_id = ${userId} and character_id = ${characterId} and day = ${day} and status = 'planned' limit 1`;
  if (dupe) await sql()`update chat_plans set title = ${title}, details = ${details}, at_time = ${at}, kind = ${kind} where id = ${dupe.id}`;
  else {
    const [{ n }] = await sql()`select count(*)::int as n from chat_plans where user_id = ${userId} and character_id = ${characterId} and status = 'planned'`;
    if (n >= 10) return { error: "You already have plenty of plans with them — no need to save more right now." };
    await sql()`insert into chat_plans (user_id, character_id, title, details, day, at_time, kind) values (${userId}, ${characterId}, ${title}, ${details}, ${day}, ${at}, ${kind})`;
  }
  return { ok: true, tell_them: `Saved for ${day}${at ? ` at ${at}` : ""} (${kind === "person" ? "seeing each other in person" : "a video chat"}). When the time comes they'll be asked to start it. Don't mention the app or this tool — just be glad it's a plan.` };
}

/** Upcoming plans with this character, for the prompt. */
export async function plansNote(userId: string, characterId: string, today: string): Promise<string> {
  const rows = await sql()`select title, details, day::text, at_time, kind from chat_plans where user_id = ${userId} and character_id = ${characterId} and status = 'planned' and day >= ${today} order by day limit 6`;
  if (!rows.length) return "";
  return "PLANS YOU TWO HAVE MADE: " + rows.map(r => `${r.day === today ? "TODAY" : r.day}${r.at_time ? ` at ${r.at_time}` : ""} (${r.kind === "person" ? "in person" : "video chat"}): ${r.title}${r.details ? ` (${r.details})` : ""}`).join("; ") + ". Look forward to them; if one is today, you can mention it.";
}

/** Plans whose day has come (today, or up to 2 days ago and not yet played), for this chat. */
export async function duePlans(userId: string, characterId: string, today: string): Promise<Plan[]> {
  const rows = await sql()`select id, title, details, day::text, at_time, kind from chat_plans where user_id = ${userId} and character_id = ${characterId}
    and status = 'planned' and day <= ${today} and day >= ${today}::date - 2 order by day limit 3`;
  return rows.map(r => ({ id: String(r.id), title: String(r.title), details: String(r.details), day: String(r.day), time: String(r.at_time || ""), kind: (r.kind === "person" ? "person" : "video") as PlanKind }));
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

/**
 * ⏰ A plan whose moment has come: the agreed time has arrived (or it's past 9am on the day and no
 * time was set), and nobody has started it yet. One per person — the nearest one.
 */
export async function planNow(userId: string, tz: string): Promise<Plan | null> {
  const zone = isValidTimeZone(tz) ? tz : "America/Chicago";
  const today = localDate(Date.now(), zone);
  const { hour, minute } = zonedParts(Date.now(), zone);
  const now = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const rows = await sql()`select p.id, p.title, p.details, p.day::text, p.at_time, p.kind, p.character_id, c.name, f.url as portrait
    from chat_plans p join chat_characters c on c.id = p.character_id left join velo_files f on f.id = c.portrait_file_id
    where p.user_id = ${userId} and p.status = 'planned' and p.started_at is null and p.day = ${today}::date
    order by p.at_time nulls last limit 5`;
  for (const r of rows) {
    const at = String(r.at_time || "");
    // With a time: from then on. Without one: from 9am, the way the day's nudge already works.
    if (at ? now < at : hour < 9) continue;
    return { id: String(r.id), title: String(r.title), details: String(r.details), day: String(r.day), time: at,
      kind: (r.kind === "person" ? "person" : "video") as PlanKind, character_id: String(r.character_id), who: String(r.name), portrait: r.portrait ? String(r.portrait) : null };
  }
  return null;
}

/** 🙈 Not now: don't ask about this one again today. */
export async function planLater(userId: string, planId: string): Promise<boolean> {
  const rows = await sql()`update chat_plans set started_at = now() where id = ${planId} and user_id = ${userId} and status = 'planned' returning id`;
  return rows.length > 0;
}
