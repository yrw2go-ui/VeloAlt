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
  return `💔 ${core}${softening} Be all of this in YOUR voice: ${m === "hurt" ? "if you're cold you stay cool about it, if you're daft you still find the joke in it, if you're soft you say the tender thing with an edge on it" : "however you'd normally take a present, with this underneath it"}. Keep the words plain and ordinary either way — someone who has been hurt doesn't perform, so no put-on slang and nothing you'd only type to be funny. Never mention sliders, scores or anything about how you've been "set".`;
}

/**
 * 💰 What it cost, as weight. The same curve the warm spell uses, so a dearer present means more
 * here too and the two can't disagree: nothing for a coffee, a point or so for flowers, three for
 * something extravagant. Each tenfold step is worth about the same, so the top end doesn't run away.
 */
export const spendWeight = (amount: number) => Math.max(0, Math.min(3, Math.log10(Math.max(10, amount)) - 1));

/**
 * 💗 What a present does to how she feels. It always helps a little, and it helps more when she's
 * low, when you've kept at it, when it was something she actually wanted, and when you spent real
 * money on it — but never a clean slate in one go.
 */
export function warmth(happy: number, recentGifts: number, wished: boolean, amount: number): number {
  const m = moodOf(happy);
  const base = m === "hurt" ? 3 : m === "sore" ? 2 : 1;
  const kept = Math.min(3, Math.max(0, recentGifts - 1));
  const thought = wished ? 2 : 0;
  return Math.min(8, base + kept + thought + Math.round(spendWeight(amount)));
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

/**
 * 🤐 What she says when her brain doesn't answer at all.
 *
 * It used to be one line for everybody — "it came!! <the gift> 😍 you're ridiculous" — which read
 * the label out like a receipt, said the same over-the-top thing whoever she was, and was cheerful
 * at someone who is barely speaking to you. It names nothing (the 🎁 line above already says what
 * turned up), it follows her temperament, and it follows how she feels. Plain words throughout.
 */
export function thanksFallback(t: { humor?: number; coldness?: number; flirty?: number; energetic?: number; moody?: number }, happy: number, money: boolean): string {
  const n = (v: unknown) => Math.max(0, Math.min(10, Number(v) || 0));
  const m = moodOf(happy);
  if (m === "hurt") return money
    ? "that came through. thank you — I mean it. doesn't quite fix things, but thank you."
    : "it turned up. thank you, genuinely… I don't really know what to do with it, but thank you.";
  if (m === "sore") return money
    ? "that landed. thank you — really. things still aren't sorted, but I'm not going to pretend that wasn't kind."
    : "it got here. thank you, I mean that. doesn't make everything fine, but it was kind of you.";
  // 🙂 On a good day, in her own register — and only someone genuinely over the top gets an
  // over-the-top line.
  if (n(t.coldness) >= 7) return money ? "that came through. thank you." : "it arrived. thank you — that was good of you.";
  if (n(t.moody) >= 7) return money ? "that turned up… thank you. you didn't have to." : "it came. thank you — you didn't have to do that.";
  if (n(t.energetic) >= 7) return money ? "it just landed 😭 thank you thank you thank you" : "it's here 😍 thank you, honestly";
  if (n(t.humor) >= 7) return money ? "well look at that 😄 thank you — spoiling me is a dangerous habit" : "look what just turned up 😄 thank you, you're too good to me";
  if (n(t.flirty) >= 7) return money ? "that just came through 🥰 thank you — you're far too good to me" : "it just arrived 🥰 thank you — you're far too good to me";
  return money ? "that just came through — thank you, really 🥰" : "it just arrived — thank you, really 🥰";
}
