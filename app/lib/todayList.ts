// ☀️ What today holds, fetched in one go: who you're seeing, and who's worth a word.
import { sql } from "./db";
import { localDate } from "./localTime";
import { nudgesFrom, type Nudge, type Person } from "./todayRules";

export type Hangout = { id: string; characterId: string; who: string; portrait: string | null; title: string; details: string; time: string; kind: "video" | "person"; now: boolean };
export type TodayList = { day: string; hangouts: Hangout[]; nudges: Nudge[] };

/**
 * Everything the Today tab shows about your people, for the day it is where YOU are.
 *
 * Two queries: what's arranged for today (and who you're already sat next to), and where everyone
 * stands. The rules themselves live in todayRules, away from the database.
 */
export async function todayList(userId: string, tz: string): Promise<TodayList> {
  const day = localDate(Date.now(), tz);

  // 📅 Arranged for today, and anyone you're with this minute.
  const rows = await sql()`select p.id, p.character_id, p.title, p.details, p.at_time, p.kind, c.name, f.url as face
    from chat_plans p join chat_characters c on c.id = p.character_id
    left join velo_files f on f.id = c.portrait_file_id
    where p.user_id = ${userId} and p.status = 'planned' and p.day = ${day}::date
    order by p.at_time nulls last, c.name`;
  const live = await sql()`select i.character_id, i.place, c.name, f.url as face
    from chat_in_person i join chat_characters c on c.id = i.character_id
    left join velo_files f on f.id = c.portrait_file_id
    where i.user_id = ${userId} and i.ended_at is null order by c.name`;

  const hangouts: Hangout[] = [
    ...live.map(r => ({ id: `with:${String(r.character_id)}`, characterId: String(r.character_id), who: String(r.name), portrait: r.face ? String(r.face) : null,
      title: String(r.place || "Together in person"), details: "", time: "", kind: "person" as const, now: true })),
    ...rows.filter(r => !live.some(l => String(l.character_id) === String(r.character_id)))
      .map(r => ({ id: String(r.id), characterId: String(r.character_id), who: String(r.name), portrait: r.face ? String(r.face) : null,
        title: String(r.title || ""), details: String(r.details || ""), time: String(r.at_time || ""), kind: r.kind === "person" ? "person" as const : "video" as const, now: false })),
  ];

  // 💭 Where everyone stands: what was saved, and how long since either of you said anything.
  const seeing = new Set(hangouts.map(h => h.characterId));
  const all = await sql()`select c.id, c.name, f.url as face, r.happy,
      extract(epoch from now() - m.last) / 86400 as quiet_days
    from chat_characters c
    left join velo_files f on f.id = c.portrait_file_id
    left join chat_relationships r on r.user_id = ${userId} and r.character_id = c.id
    left join lateral (select max(created_at) as last from velo_messages v where v.user_id = ${userId} and v.character_id = c.id) m on true
    where c.owner_id is null or c.owner_id = ${userId}
    order by c.name`;
  const people: Person[] = all.map(r => ({ id: String(r.id), name: String(r.name), portrait: r.face ? String(r.face) : null,
    happy: r.happy === null || r.happy === undefined ? null : Number(r.happy),
    quietDays: r.quiet_days === null || r.quiet_days === undefined ? null : Number(r.quiet_days),
    seeingToday: seeing.has(String(r.id)) }));

  return { day, hangouts, nudges: nudgesFrom(people) };
}
