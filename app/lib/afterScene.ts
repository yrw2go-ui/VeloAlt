// 🌙 A time together can run for days of their real time while, for the two of them, it's one
// unbroken occasion (see TOGETHER_TIME). The moment it ends, ordinary time starts again — and if
// the real clock crossed midnight while it was running, she'd otherwise carry on as though the
// whole thing had just happened, this morning, with no night in between.
//
// So once it's over she's told when it really was: the video chat was last night (or the night
// before), today is a new day, and they both went to bed afterwards and slept — unless what they
// actually said makes plain that they were up the whole night.

/** Phrases that mean they never went to bed — then it's morning, and neither of them has slept. */
const ALL_NIGHT = /\b(?:all[- ]?nighter|stay(?:ed|ing)? up all night|up all night|never went to (?:bed|sleep)|didn'?t (?:go to )?(?:bed|sleep)|haven'?t slept|no sleep tonight|straight through (?:the|till) (?:night|morning)|till (?:the )?sunrise|until sunrise|watch(?:ed|ing)? the sun(?:rise| come up)|see the sun come up|sun'?s coming up|still awake)\b/i;

export const stayedUpAllNight = (text: string) => ALL_NIGHT.test(text || "");

/** How many nights' sleep sit between the day it started and the day it ended, in their own time. */
export function nightsBetween(startedDay: string, endedDay: string): number {
  const a = Date.parse(`${startedDay}T12:00:00Z`), b = Date.parse(`${endedDay}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** What she's told once it's over, when it ran past midnight. Empty when it all happened today. */
export function afterSceneNote(o: { what: "video chat" | "in person"; title: string; nights: number; allNighter: boolean }): string {
  if (o.nights < 1) return "";
  const when = o.nights === 1 ? "last night" : `${o.nights} nights ago`;
  const it = o.what === "video chat" ? `your video chat (${o.title})` : `your time together (${o.title})`;
  if (o.allNighter) {
    return `🌙 ONE THING ABOUT WHEN THAT WAS: ${it} started ${when} and ran straight through — the two of you were up the whole night and never went to bed. It's a new day now and you've had no sleep at all: you're running on nothing, and it shows. Talk about it as the night you just had, not as something happening now, and don't pretend you slept.`;
  }
  return `🌙 ONE THING ABOUT WHEN THAT WAS: ${it} was ${when}, not just now. It's a new day since: you two said goodnight, you both went to bed and slept, and you've woken up and had your day going on as usual in between. Look back on it as ${when}${o.nights === 1 ? " (yesterday evening, last night)" : ""}, not as something that's still going on, and don't carry straight on from the middle of it. Nothing stops you bringing it up, teasing about it or picking a thread back up — it just happened ${when}.`;
}
