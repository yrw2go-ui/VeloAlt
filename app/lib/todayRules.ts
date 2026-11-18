// ☀️ What today looks like: who you're seeing, and who's worth a word.
//
// The rules only, with no database anywhere near them, so they can be read and tested on their own.
// Nothing here nags: a person appears once, for the best reason, and only when there is something
// you could actually do about it.

export type Nudge = { kind: "quiet" | "unhappy"; characterId: string; who: string; portrait: string | null; line: string };

/** 🤫 Gone this long without a word and she notices — so should you. */
export const QUIET_DAYS = 5;
/** 🙁 Below this she isn't happy with how things are, and it's worth knowing before she says so. */
export const UNHAPPY_BELOW = 55;
/** 😊 Where everyone starts, before anything has happened between you. */
export const HAPPY_START = 60;

/**
 * 😊 How happy she is, worked out the same way the chat works it out: what was saved, less a little
 * for every day after the first two that you've left her alone, and never under 25 once it starts
 * slipping. Kept here so the Today list and the chat can never disagree about it.
 */
export function happyNow(saved: number | null, quietDays: number): number {
  const base = saved ?? HAPPY_START;
  const quiet = Math.max(0, Math.floor(quietDays) - 2);
  return Math.max(quiet ? 25 : 0, Math.min(100, Math.round(base - quiet * 3)));
}

/** How long it's been, in words a person would use. */
export function sinceWords(days: number): string {
  const d = Math.floor(days);
  if (d >= 60) return "in months";
  if (d >= 30) return "in over a month";
  if (d >= 14) return "in a couple of weeks";
  if (d >= 7) return "in a week";
  return `in ${d} days`;
}

export type Person = { id: string; name: string; portrait: string | null; happy: number | null; quietDays: number | null; seeingToday: boolean };

/**
 * 💭 Who's worth a word today, and why.
 *
 * Someone you've never messaged isn't being neglected, she's just new, so she's left out of it.
 * Someone you're seeing today is already on the list above, so she isn't also listed as ignored.
 * And nobody appears twice: having gone quiet explains being unhappy, so that's the one you're told.
 */
export function nudgesFrom(people: Person[]): Nudge[] {
  const out: Nudge[] = [];
  for (const p of people) {
    if (p.seeingToday || p.quietDays === null) continue; // seeing her today, or never spoken
    const days = p.quietDays;
    if (days >= QUIET_DAYS) {
      out.push({ kind: "quiet", characterId: p.id, who: p.name, portrait: p.portrait, line: `You haven't texted ${p.name} ${sinceWords(days)}.` });
      continue;
    }
    if (happyNow(p.happy, days) < UNHAPPY_BELOW) {
      out.push({ kind: "unhappy", characterId: p.id, who: p.name, portrait: p.portrait, line: `${p.name} isn't feeling great about things right now.` });
    }
  }
  // The quiet ones first, longest first; then the unhappy ones.
  return out.sort((a, b) => (a.kind === b.kind ? a.who.localeCompare(b.who) : a.kind === "quiet" ? -1 : 1));
}
