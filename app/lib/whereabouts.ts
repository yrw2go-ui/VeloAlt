// 🧭 Where everyone is right now — one answer, so the map, the lists and her own chat can never
// disagree about it. Nothing here is random and nothing is written down: it is worked out from her
// shift, her classes, her trips and the opening hours of the place, in HER time zone, every time
// it is asked for. That is also why it costs nothing to ask.
//
// This first pass only knows what she is OBLIGED to do — work and class. Where she chooses to go
// of an evening comes later; until then a quiet day is a quiet day and she is simply at home.
import { sql } from "./db";
import { localDate, zonedParts } from "./localTime";
import { workNow } from "./work";
import { placeById, placeOpen, type Place } from "./places";

export type Whereabouts = {
  id: string; name: string; portrait_url: string | null;
  where: "work" | "class" | "trip" | "home";
  place: string;              // what to call it on screen
  placeId: string;            // a local spot's id, or "" when it isn't one of ours
  emoji: string;
  until: string;              // "11:00 PM" or a date for a trip; "" when it isn't known
  local: boolean;             // somewhere you could actually walk into
};

const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h)) return "";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** 🧭 Everyone who isn't simply at home, in the order you'd want to read them. */
export async function whosOut(userId: string, now = Date.now()): Promise<Whereabouts[]> {
  const [u] = await sql()`select coalesce(nullif(time_zone, ''), 'America/Chicago') as tz from users where id = ${userId}`;
  const mine = String(u?.tz || "America/Chicago");
  const chars = await sql()`select c.id, c.name, c.time_zone, c.local, c.lives_in, c.works_at, c.work_days, c.work_start, c.work_end,
      c.part_time, c.school, c.class_days, c.class_start, c.class_end, f.url as portrait_url
    from chat_characters c left join velo_files f on f.id = c.portrait_file_id
    where c.owner_id is null or c.owner_id = ${userId}`;
  // 🛌 A day off, and a trip somewhere — both already kept, both decide where she is before work does.
  const offRows = await sql()`select character_id, day::text as day from chat_off where user_id = ${userId} and day >= current_date - 1`.catch(() => []);
  const off = new Set(offRows.map(r => `${r.character_id}:${r.day}`));
  const trips = await sql()`select character_id, place, until::text as until from chat_away
    where user_id = ${userId} and kind = 'trip' and until >= current_date - 1`.catch(() => []);
  const tripBy = new Map(trips.map(t => [String(t.character_id), { place: String(t.place), until: String(t.until) }]));

  const out: Whereabouts[] = [];
  for (const c of chars) {
    const id = String(c.id);
    const zone = String(c.time_zone || "") || mine;
    const today = localDate(now, zone);
    const t = zonedParts(now, zone);
    const hhmm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
    const base = { id, name: String(c.name), portrait_url: c.portrait_url ? String(c.portrait_url) : null };

    // ✈️ Away for a few days: that's where she is, whatever her rota says.
    const trip = tripBy.get(id);
    if (trip && trip.until >= today) {
      out.push({ ...base, where: "trip", place: trip.place, placeId: "", emoji: "✈️", until: trip.until, local: false });
      continue;
    }

    const w = workNow(c as Parameters<typeof workNow>[0], zone, now, off.has(`${id}:${today}`), id);
    if (!w.atWork) continue;

    if (w.kind === "class") {
      out.push({ ...base, where: "class", place: String(c.school || "class"), placeId: "", emoji: "🎓",
        until: clock12(String(c.class_end || "")), local: !!c.local });
      continue;
    }
    // 💼 At work. If her workplace is one of the local spots, she's somewhere you could walk into —
    // but only while the place itself is open, so a closed shop never has someone standing in it.
    const p: Place | null = placeById(c.works_at);
    const open = p ? placeOpen(p, hhmm, t.month) : true;
    out.push({
      ...base, where: "work",
      place: p ? p.name : "work", placeId: p && open ? p.id : "", emoji: p ? p.emoji : "💼",
      until: clock12(String(c.work_end || "")),
      local: !!c.local && !!p && open && !p.away,
    });
  }
  // The ones you could actually run into first, then class, then whoever's away.
  const rank = (x: Whereabouts) => (x.local ? 0 : x.where === "work" ? 1 : x.where === "class" ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
