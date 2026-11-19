// 💔 A present from someone who has hurt you.
//
// It doesn't land the way it would on a good day, and it isn't thrown back in your face either. She
// appreciates it — and says so — but there's something else in the message, and she doesn't hide it.
// It warms her a little, and the next one warms her more: presents give you chances rather than a
// clean slate. Through all of it she's still herself, so a cold one stays cool about it and a daft
// one still cracks a joke.
//
// No database anywhere near this file, so it can be read and tested on its own.

/** 😊 Where she's content enough for a present to land plainly. */
export const FINE_FROM = 55;
/** 🙁 Below this she's really not happy, and it shows in every part of it. */
export const SORE_BELOW = 30;

export type Mood = "fine" | "sore" | "hurt";

/** How she is with you right now, in one word. */
export function moodOf(happy: number): Mood {
  if (happy >= FINE_FROM) return "fine";
  if (happy >= SORE_BELOW) return "sore";
  return "hurt";
}

/**
 * 📷 How likely a photo is to come with it. She's less inclined to pose for someone she's upset
 * with — but presents chip away at that, so keeping at it earns one back.
 */
export function photoOdds(base: number, happy: number, recentGifts: number): number {
  const m = moodOf(happy);
  if (m === "fine") return base;
  const eased = Math.min(0.25, Math.max(0, recentGifts - 1) * 0.08);
  return Math.max(0.1, Math.min(base, (m === "hurt" ? 0.3 : 0.55) + eased));
}

/**
 * 💬 What she's told about how she feels, when she writes back about a present.
 *
 * She appreciates it. She also hasn't forgotten. Both go in the same message, because that's how
 * people are — and as the presents add up, the second part softens.
 */
export function hurtNote(happy: number, recentGifts: number, them: string): string {
  const m = moodOf(happy);
  if (m === "fine") return "";
  const many = recentGifts >= 3, some = recentGifts === 2;
  const softening = many
    ? ` ${them} has kept at it — this isn't the first thing they've sent lately — and it is working: you're closer to your old self with them than you were, and you let that show.`
    : some
    ? ` This isn't the first thing they've sent lately, and you've noticed. It's starting to land.`
    : "";
  const core = m === "hurt"
    ? `You are NOT in a good place with ${them} at the moment — you've been hurt, and it hasn't gone away because a parcel turned up. Thank them, and mean it: you do appreciate it, and it does warm you to them a little. But say the other part too, in your own words — that it doesn't undo what happened, or that you don't quite know what to do with it, or that you wish they'd given you the thing you actually wanted from them. Two things at once, the way anyone would: pleased and still sore. Never gush, never pretend it's all fine, and never be cruel about it either — you're not punishing them, you're just not over it.`
    : `Things aren't quite right between you and ${them} just now, and this arriving is a bit complicated. You like it, genuinely, and you say so — but it's mixed, and some of that comes through: a shorter message than you'd otherwise write, a note of "you didn't have to", or saying straight out that it's lovely and things still aren't sorted. Warm, but not all the way back.`;
  return `💔 ${core}${softening} Be all of this in YOUR voice: ${m === "hurt" ? "if you're cold you stay cool about it, if you're daft you still find the joke in it, if you're soft you say the tender thing with an edge on it" : "however you'd normally take a present, with this underneath it"}. Never mention sliders, scores or anything about how you've been "set".`;
}

/**
 * 💗 What a present does to how she feels. It always helps a little, and it helps more when she's
 * low and when you've kept at it — you can't buy your way out in one go, but you can make your way
 * back. Never more than a few points at a time.
 */
export function warmth(happy: number, recentGifts: number, wished: boolean, big: boolean): number {
  const m = moodOf(happy);
  const base = m === "hurt" ? 3 : m === "sore" ? 2 : 1;
  const kept = Math.min(3, Math.max(0, recentGifts - 1));
  const thought = (wished ? 2 : 0) + (big ? 1 : 0);
  return Math.min(8, base + kept + thought);
}

/**
 * 🎁 How much of the warm spell she actually feels while she's sore. It still applies — she's still
 * readier to see you than she was — but not as though nothing happened. More presents close the gap.
 */
export function boostScale(happy: number, recentGifts: number): number {
  const m = moodOf(happy);
  if (m === "fine") return 1;
  const eased = Math.min(0.3, Math.max(0, recentGifts - 1) * 0.1);
  return Math.min(1, (m === "hurt" ? 0.5 : 0.75) + eased);
}
