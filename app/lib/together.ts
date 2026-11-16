// 🧍🎥 Being together: in person, on a video chat, or at a group meet-up.
//
// Two at a time, no more — the rest of your characters carry on texting as usual. A time together
// can run for days of real time; for the people in it, it's still the same occasion. No days pass,
// nobody notices a gap, and nobody says "where have you been". Ordinary time starts again the
// moment it ends.
import { sql } from "./db";
import { HOME } from "./inPerson";

/** How many times together you can have running at once. */
export const MAX_TOGETHER = 2;

export type Busy = { who: string; what: "in person" | "video chat" | "meet-up" };

/** Everyone you're with right now. A live-in simply being home isn't one of these — that's her
 *  ordinary life at home, not a meet-up. */
export async function togetherNow(userId: string): Promise<Busy[]> {
  const rows = await sql()`
    select c.name, 'in person' as what from chat_in_person p join chat_characters c on c.id = p.character_id
      where p.user_id = ${userId} and not (c.live_in and p.place = ${HOME})
    union all
    select c.name, 'video chat' as what from chat_scenes s join chat_characters c on c.id = s.character_id
      where s.user_id = ${userId} and s.status = 'active' and s.kind = 'live' and s.character_id is not null
    union all
    select g.title as name, 'meet-up' as what from chat_groups g
      where g.user_id = ${userId} and g.scene_title is not null`;
  return rows.map(r => ({ who: String(r.name || ""), what: r.what as Busy["what"] }));
}

/** Room for one more? Counts what's already running, leaving out this character (or group) so
 *  carrying on with someone you're already with is never blocked. */
export async function roomForMore(userId: string, exclude?: string | null): Promise<string | null> {
  const on = await togetherNow(userId).catch(() => []);
  const others = exclude ? on.filter(b => b.who.toLowerCase() !== String(exclude).toLowerCase()) : on;
  if (others.length < MAX_TOGETHER) return null;
  const list = others.slice(0, MAX_TOGETHER).map(b => `${b.who} (${b.what})`).join(" and ");
  return `You're already with ${list}. Finish one of those first — two at a time is the most you can keep up with.`;
}

/** 🕒 While you're together: however long it's really taken, it's still the same occasion. */
export const TOGETHER_TIME = `🕒 THIS IS ONE CONTINUOUS OCCASION. It may have taken days of their time to play out, but none of that has happened to you: for you this is one unbroken stretch of being together, carrying straight on from the last thing either of you said. Never mention dates, days of the week, "yesterday", "last night", "this morning", how long they took to answer, or any gap at all, and never wonder where they went or tell them to get some sleep because the clock moved. Nothing in your life has happened in between. Ordinary time starts again once you two part.`;
