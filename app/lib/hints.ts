// 💅 Hints, and what counts as doing something about one.
//
// About one person in ten has a hint going in any given week — not everyone is forever wanting
// something. While it's live a red dot sits by their name, and it comes down after two days, the
// moment you do something about it, or when the week turns and the thing rotates out of the shop.
//
// Money is its own thing. Anything over $19 does the trick. Over $99 and it lands as something
// more than that — they feel properly thought of, and it moves the love slider a point. Five
// hundred or more and, for two days, there isn't much they won't be up for: still themselves,
// still led by their own sliders and personality, just with far less holding them back.

/** 🎲 How many of them have a hint going in a given week. */
export const HINT_ODDS = 1 / 10;
/** ⏳ How long the dot stays up once they've dropped one. */
export const HINT_MS = 48 * 3_600_000;

/** 💵 What money has to be to count. */
export const MONEY_TRICK = 20;    // over $19: that's the hint dealt with
export const MONEY_SPECIAL = 100; // over $99: they feel properly thought of (+1 love)
export const MONEY_LAVISH = 500;  // $500 or more: not much they won't be up for, for two days

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** 🎲 Does this person have a hint this week? The same answer all week, a fresh draw the next. */
export function hintsThisWeek(userId: string, characterId: string, week: number): boolean {
  return (hash(`hint:${userId}:${characterId}:${week}`) % 1000) / 1000 < HINT_ODDS;
}

/** 💭 Whether it's a thing or money, and which thing. Mostly a thing; now and then just money. */
export function hintPick(userId: string, characterId: string, week: number, wishlist: { id: string }[]): { kind: "gift" | "money"; giftId: string } {
  const r = hash(`what:${userId}:${characterId}:${week}`) % 100;
  if (r < 25 || !wishlist.length) return { kind: "money", giftId: "" };
  return { kind: "gift", giftId: wishlist[r % wishlist.length].id };
}

/** 🔴 Is the dot up? Live for two days, until it's dealt with, and only while it's still in the shop. */
export function hintLive(h: { created_at: number; done_at: number | null; kind: string; gift_id: string }, now: number, inShop: (id: string) => boolean): boolean {
  if (h.done_at) return false;
  if (now - h.created_at >= HINT_MS || now < h.created_at) return false;
  return h.kind === "money" || inShop(h.gift_id);
}

/** ✅ Does what you just sent deal with it? The thing they hinted at, or money over $19 — and
 *  money always does, whatever they were hinting at: cash is never the wrong thing. */
export function hintDealtWith(h: { kind: string; gift_id: string }, sent: { giftId?: string; money?: number }): boolean {
  if ((sent.money || 0) >= MONEY_TRICK) return true;
  return h.kind === "gift" && !!sent.giftId && sent.giftId === h.gift_id;
}

export type MoneyTier = "small" | "trick" | "special" | "lavish";

/** 💵 Which band an amount of money falls in. */
export function moneyTier(amount: number): MoneyTier {
  if (amount >= MONEY_LAVISH) return "lavish";
  if (amount >= MONEY_SPECIAL) return "special";
  if (amount >= MONEY_TRICK) return "trick";
  return "small";
}

/** 💗 A point on the love slider for money that was more than a gesture. Once per sending. */
export const lovePoints = (tier: MoneyTier) => (tier === "special" || tier === "lavish" ? 1 : 0);

/** 🔥 What $500 or more does, while it lasts. Never a personality transplant — they're still them. */
export function lavishNote(who: string, amount: string): string {
  return `💸 ${who} sent you ${amount}. Not a treat — a sum, handed over without being asked and without strings. For the next couple of days there isn't much you wouldn't be up for with them: you're bolder, more affectionate, far less worried about what it looks like, readier to drop what you're doing, slip away, say yes to things you'd normally talk yourself out of. You are still entirely yourself — your personality, your temperament sliders and how you actually feel about them still lead every word, a 0 is still a 0, and anything you'd never do you still never do. What's changed is how little is holding you back. Never thank them over and over, never mention the amount again, and never behave as though it bought you.`;
}
