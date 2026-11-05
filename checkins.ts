// 🔔 Check-ins: now and then, Velo or one of their characters texts them first — written in
// their own voice, using their memory of the person — and it arrives as a push notification.
// Only for people who turned notifications on; never at night (9pm–9am their time); not while
// they're actively chatting; at most once a day ("sometimes") or twice ("often").
import { sql } from "./db";
import { askVelo } from "./brain";
import { getCharacter } from "./characters";
import { isValidTimeZone, zonedParts } from "./localTime";
import { sendPush } from "./push";

export const CHECKIN_LEVELS = ["off", "sometimes", "often"] as const;
const CHANCE = { sometimes: 0.6, often: 1 } as const; // per run (two runs a day)
const PER_DAY = { sometimes: 1, often: 2 } as const;

export async function runCheckins(opts: { userId?: string; force?: boolean } = {}): Promise<{ sent: number; looked: number }> {
  const users = await sql()`select u.id, u.email, u.name, u.time_zone, u.checkins from users u
    where u.checkins <> 'off' and exists (select 1 from push_subscriptions p where p.user_id = u.id)
      and (${opts.userId || null}::uuid is null or u.id = ${opts.userId || null}::uuid)
    order by random() limit 40`;
  let sent = 0;
  for (const u of users) {
    try { if (await checkIn(u as { id: string; email: string; name: string | null; time_zone: string | null; checkins: "sometimes" | "often" }, !!opts.force)) sent++; }
    catch (e) { console.error("checkins:", e instanceof Error ? e.message : e); }
  }
  return { sent, looked: users.length };
}

async function checkIn(u: { id: string; email: string; name: string | null; time_zone: string | null; checkins: "sometimes" | "often" }, force: boolean): Promise<boolean> {
  const tz = isValidTimeZone(u.time_zone) ? u.time_zone : "America/Chicago";
  const hour = zonedParts(Date.now(), tz).hour;
  if (!force && (hour < 9 || hour >= 21)) return false;
  const [busy] = await sql()`select 1 from velo_messages where user_id = ${u.id} and role = 'user' and created_at > now() - interval '3 hours' limit 1`;
  if (busy && !force) return false;
  const [{ n, last }] = await sql()`select count(*)::int as n, max(sent_at) as last from chat_checkins where user_id = ${u.id} and sent_at > now() - interval '20 hours'`;
  if (!force && (n >= PER_DAY[u.checkins] || (last && Date.now() - new Date(last).getTime() < 4 * 3600_000))) return false;
  if (!force && Math.random() > CHANCE[u.checkins]) return false;

  // Who reaches out: Velo or a character they've talked with lately (not the same one as last time, if there's a choice).
  const threads = (await sql()`select m.character_id from velo_messages m left join chat_characters c on c.id = m.character_id
    where m.user_id = ${u.id} and m.role = 'user' and m.created_at > now() - interval '21 days' and (m.character_id is null or c.id is not null)
    group by m.character_id`).map(r => (r.character_id ? String(r.character_id) : null));
  const [prev] = await sql()`select character_id from chat_checkins where user_id = ${u.id} order by sent_at desc limit 1`;
  const options = threads.length ? threads : [null];
  const fresh = options.length > 1 ? options.filter(t => t !== (prev?.character_id ? String(prev.character_id) : null)) : options;
  const cid = fresh[Math.floor(Math.random() * fresh.length)] ?? null;
  const character = cid ? await getCharacter(cid) : null;
  if (cid && !character) return false;

  const history = (await sql()`select role, content from velo_messages where user_id = ${u.id} and character_id is not distinct from ${cid}
    order by created_at desc limit 20`).reverse().map(r => ({ role: r.role === "assistant" ? "assistant" as const : "user" as const, content: String(r.content) }));
  const r = await askVelo({ userId: u.id, email: u.email }, { mode: "checkin", messages: history, timeZone: tz, name: u.name || "", character });
  const text = r.reply.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text || /lost my train of thought/i.test(text)) return false;

  await sql()`insert into velo_messages (user_id, role, content, character_id) values (${u.id}, 'assistant', ${text}, ${cid})`;
  await sql()`insert into chat_checkins (user_id, character_id) values (${u.id}, ${cid})`;
  await sendPush(u.id, { title: character?.name || "Velo", body: text.slice(0, 180), url: `/?chat=${cid || "velo"}`, icon: character?.portrait_url || "/icon-192.png", tag: `chat-${cid || "velo"}` });
  return true;
}
