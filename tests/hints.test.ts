// Run: node --experimental-strip-types tests/hints.test.ts
import { hintsThisWeek, hintPick, hintLive, hintDealtWith, moneyTier, lovePoints, giftLovePoints, GIFT_LOVE_AT, lavishNote,
  HINT_ODDS, HINT_MS, MONEY_TRICK, MONEY_SPECIAL, MONEY_LAVISH } from "../app/lib/hints.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const me = "11111111-1111-1111-1111-111111111111";
const NOW = Date.parse("2026-11-18T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;
const girls = Array.from({ length: 400 }, (_, i) => `c${i}`);

// 🎲 About one in ten, in any given week.
ok(HINT_ODDS === 1 / 10, "one in ten of them have a hint going");
const week = 2900;
const hinting = girls.filter(g => hintsThisWeek(me, g, week)).length;
ok(hinting > 400 * 0.05 && hinting < 400 * 0.16, `roughly a tenth of them do (${hinting} of 400)`);
ok(girls.every(g => hintsThisWeek(me, g, week) === hintsThisWeek(me, g, week)), "the same ones all week");
const next = girls.filter(g => hintsThisWeek(me, g, week + 1)).length;
ok(next > 0 && girls.some(g => hintsThisWeek(me, g, week) !== hintsThisWeek(me, g, week + 1)), `a fresh draw the next week (${next})`);

// 💭 What they hint at: usually something off their list, sometimes just money.
const list = [{ id: "gucci-purse" }, { id: "prada-sunglasses" }, { id: "nike-shoes" }];
const picks = girls.map(g => hintPick(me, g, week, list));
ok(picks.some(p => p.kind === "gift") && picks.some(p => p.kind === "money"), "some hint at a thing, some at money");
ok(picks.filter(p => p.kind === "gift").length > picks.filter(p => p.kind === "money").length, "mostly a thing");
ok(picks.filter(p => p.kind === "gift").every(p => list.some(g => g.id === p.giftId)), "…and always something off their own list");
ok(hintPick(me, "c1", week, []).kind === "money", "with nothing on their list, it's money");

// 🔴 The dot: two days, and only while it's still in the shop.
const inShop = (id: string) => id !== "gone";
const live = (o: Partial<{ created_at: number; done_at: number | null; kind: string; gift_id: string }>) =>
  hintLive({ created_at: hoursAgo(1), done_at: null, kind: "gift", gift_id: "gucci-purse", ...o }, NOW, inShop);
ok(HINT_MS === 48 * 3_600_000, "it stays up for two days");
ok(live({}), "a hint from an hour ago is up");
ok(live({ created_at: hoursAgo(47) }), "…still up just under two days later");
ok(!live({ created_at: hoursAgo(49) }), "…and down after them");
ok(!live({ done_at: NOW }), "dealt with, it comes down");
ok(!live({ gift_id: "gone" }), "rotated out of the shop, it comes down");
ok(live({ kind: "money", gift_id: "" }), "money never rotates out");
ok(!live({ created_at: NOW + 3_600_000 }), "one dated in the future isn't up");

// ✅ What deals with it.
const h = { kind: "gift", gift_id: "gucci-purse" };
ok(hintDealtWith(h, { giftId: "gucci-purse" }), "the thing they hinted at deals with it");
ok(!hintDealtWith(h, { giftId: "nike-shoes" }), "something else doesn't");
ok(hintDealtWith(h, { money: 20 }), `$20 does the trick (over $${MONEY_TRICK - 1})`);
ok(!hintDealtWith(h, { money: 19 }), "$19 doesn't");
ok(hintDealtWith({ kind: "money", gift_id: "" }, { money: 50 }), "money for a money hint, of course");
ok(!hintDealtWith({ kind: "money", gift_id: "" }, { giftId: "nike-shoes" }), "a thing doesn't settle a money hint");

// 💵 The bands.
ok(moneyTier(5) === "small" && moneyTier(19) === "small", "under $20 is a gesture");
ok(moneyTier(20) === "trick" && moneyTier(99) === "trick", "$20 to $99 does the trick");
ok(moneyTier(100) === "special" && moneyTier(499) === "special", `$${MONEY_SPECIAL} and up feels like something`);
ok(moneyTier(500) === "lavish" && moneyTier(5000) === "lavish", `$${MONEY_LAVISH} and up is another thing entirely`);

// 💗 A present you really spent on moves the love slider too — at a higher bar than cash, because
// money always lands and a thing might not.
ok(giftLovePoints(GIFT_LOVE_AT) === 1 && giftLovePoints(7350) === 1, `a present of $${GIFT_LOVE_AT} or more counts`);
ok(giftLovePoints(GIFT_LOVE_AT - 1) === 0 && giftLovePoints(10) === 0, "…and anything under it doesn't");
ok(GIFT_LOVE_AT > MONEY_SPECIAL, `cash gets there sooner ($${MONEY_SPECIAL}) than a present does ($${GIFT_LOVE_AT})`);
ok(lovePoints(moneyTier(100)) === 1 && giftLovePoints(100) === 0, "…so $100 in cash counts where a $100 present doesn't");
ok(lovePoints("special") === 1 && lovePoints("lavish") === 1, "over $99 is worth a point of love");
ok(lovePoints("trick") === 0 && lovePoints("small") === 0, "…under it, none");

// 🔥 What $500 does, and what it doesn't.
const note = lavishNote("Sam", "$500");
ok(/Sam sent you \$500/.test(note), "she knows what landed");
ok(/isn't much you wouldn't be up for/.test(note) && /far less worried/.test(note) && /more affectionate/.test(note), "…and that she's bolder with them for it");
ok(/still entirely yourself/.test(note) && /temperament sliders/.test(note) && /a 0 is still a 0/.test(note), "…while her sliders and personality still lead");
ok(/anything you'd never do you still never do/.test(note), "…and nothing she wouldn't do becomes something she would");
ok(/never behave as though it bought you/.test(note), "…and it never reads as having bought her");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
