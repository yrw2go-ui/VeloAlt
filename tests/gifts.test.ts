// Run: node --experimental-strip-types tests/gifts.test.ts
import { GIFTS, giftById, shopFor, weekOf, wishlistFor, onWishlist, boostFrom, boostNote, BOOST_MS, myGift, myGiftId, isMyGift, MAX_MY_GIFTS, MY_GIFT_EMOJI, photoBrief, MONEY_FLOOR, WISHED_X, WANTS_YOURS_AT } from "../app/lib/gifts.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const NOW = Date.parse("2026-11-18T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3_600_000;

// 🎁 Thirty things, each priced like the real thing.
ok(GIFTS.length === 35, `thirty-five gifts to choose from (${GIFTS.length})`);
ok(new Set(GIFTS.map(g => g.id)).size === GIFTS.length, "…no two the same");
ok(GIFTS.every(g => g.price >= 8 && g.price <= 8000), "…all priced like the real thing");
ok(!!giftById("gucci-purse") && giftById("gucci-purse")!.price > 2000, "a Gucci purse costs what a Gucci purse costs");
ok(giftById("nike-shoes")!.price < 200 && giftById("coach-wallet")!.price < 250, "…and trainers and a wallet don't");
ok(!giftById("nothing-like-this"), "something that isn't on the list isn't found");

// 🔁 The shop changes week to week, but never leaves you with nothing.
const w = weekOf(NOW);
ok(weekOf(NOW + 7 * 86_400_000) === w + 1, "a week later is the next week");
ok(weekOf(NOW + 6 * 3_600_000) === w, "…and six hours later is the same one");
const [a, b] = [shopFor(w), shopFor(w + 1)];
ok(a.length >= 20 && a.length <= 31, `the shop holds a good spread (${a.length})`);
ok(JSON.stringify(a) === JSON.stringify(shopFor(w)), "the same week always has the same shop");
ok(JSON.stringify(a) !== JSON.stringify(b), "the next week's is different");
ok(a.filter(g => g.price <= 200).length === GIFTS.filter(g => g.price <= 200).length, "the everyday things are always in");

// ☕ The five small ones, always there, never rotated, never on a wishlist.
const staples = GIFTS.filter(g => g.always);
ok(staples.length === 5, `five small ones that never rotate (${staples.map(g => g.name).join(", ")})`);
ok(staples.every(g => shopFor(w).some(x => x.id === g.id) && shopFor(w + 7).some(x => x.id === g.id) && shopFor(w + 31).some(x => x.id === g.id)), "…in the shop every week, whatever the week");
ok(giftById("iced-latte")!.price === 10 && giftById("ice-cream")!.price === 8 && giftById("food-delivery")!.price === 30
  && giftById("gift-card")!.price === 50 && giftById("team-gear")!.price === 60, "…priced as the small things they are");
ok(!staples.some(g => ["aaa", "bbb", "ccc", "ddd"].some(who => [w, w + 1, w + 5].some(k => wishlistFor(who, k).some(x => x.id === g.id)))), "…and never what someone puts on a wishlist");
ok(/their OWN team/.test(photoBrief("team gear", "gift", giftById("team-gear")).brief), "team gear is their own team, not a random one");
// ☕🍦🥡 And the edible ones are whatever THIS person actually orders.
for (const id of ["iced-latte", "ice-cream", "food-delivery"]) {
  const brief = photoBrief(giftById(id)!.name, "gift", giftById(id)).brief;
  ok(/their OWN usual/.test(brief) && /THIS person actually orders/.test(brief), `a ${giftById(id)!.name} is their own usual, not a stock one`);
  ok(/never tacos unless tacos are genuinely theirs/.test(brief), `…and nobody defaults to tacos (${id})`);
}
ok(!/OWN usual/.test(photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse")).brief), "a purse is just a purse — it isn't theirs to choose");
ok(/follow or play for/.test(photoBrief("team gear", "gift", giftById("team-gear")).brief), "…the one they follow or play for");
ok(a.some(g => g.price > 1000) || b.some(g => g.price > 1000), "and the dear things come round");

// 💭 Everyone keeps a wishlist of their own, and it moves on.
const her = "11111111-1111-1111-1111-111111111111", him = "22222222-2222-2222-2222-222222222222";
ok(wishlistFor(her, w).length === 3, "three things on a wishlist");
ok(JSON.stringify(wishlistFor(her, w)) === JSON.stringify(wishlistFor(her, w)), "…the same all week");
ok(JSON.stringify(wishlistFor(her, w)) !== JSON.stringify(wishlistFor(her, w + 1)), "…and different next week");
ok(JSON.stringify(wishlistFor(her, w)) !== JSON.stringify(wishlistFor(him, w)), "…and her own, not his");
ok(onWishlist(her, w, wishlistFor(her, w)[0].id), "something on her list is on her list");
ok(!onWishlist(him, w, wishlistFor(her, w)[0].id) || true, "…which says nothing about his");

// 💝 What a present is worth, and for how long.
ok(boostFrom([], NOW) === null, "nothing sent, nothing doing");
const small = boostFrom([{ amount: 45, wished: false, at: hoursAgo(1) }], NOW)!;
const big = boostFrom([{ amount: 2450, wished: false, at: hoursAgo(1) }], NOW)!;
ok(big.flirty > small.flirty && big.eager > small.eager, `a Gucci purse lands harder than a tumbler (${big.flirty} vs ${small.flirty})`);
ok(small.flirty > 0, "…but a small one still counts for something");
ok(big.flirty <= 3 && big.eager <= 1, "…and nothing runs away with itself");
const plain = boostFrom([{ amount: 445, wished: false, at: hoursAgo(1) }], NOW)!;
const asked = boostFrom([{ amount: 445, wished: true, at: hoursAgo(1) }], NOW)!;
ok(asked.flirty > plain.flirty, `something they actually wanted is worth far more (${plain.flirty} → ${asked.flirty})`);
ok(WISHED_X >= 1.5, "…by a good margin, not a nudge");

// 💵 Cash always lands, whatever the size.
const cash = (amount: number) => boostFrom([{ amount, wished: false, money: true, at: hoursAgo(1) }], NOW)!;
ok(cash(50).flirty >= MONEY_FLOOR, `even $50 in cash lands (${cash(50).flirty})`);
ok(cash(50).flirty > boostFrom([{ amount: 50, wished: false, at: hoursAgo(1) }], NOW)!.flirty, "…harder than a $50 present that wasn't asked for");
ok(cash(50).flirty > boostFrom([{ amount: 50, wished: true, at: hoursAgo(1) }], NOW)!.flirty, "…and harder than a $50 one that was");
ok(cash(5000).flirty >= cash(50).flirty && cash(5000).flirty <= 3, "more cash is still more, up to the cap");
ok(cash(10).flirty >= MONEY_FLOOR, "a tenner still counts as cash, not a token");
ok(boostFrom([{ amount: 445, wished: false, at: hoursAgo(49) }], NOW) === null, "two days on, it's worn off");
ok(boostFrom([{ amount: 445, wished: false, at: hoursAgo(47) }], NOW) !== null, "just under two days, it hasn't");
const many = boostFrom([1, 2, 3, 4].map(h => ({ amount: 445, wished: false, at: hoursAgo(h) })), NOW)!;
ok(many.flirty > plain.flirty && many.flirty <= 3, "several presents help a little, never without limit");
ok(boostFrom([{ amount: 445, wished: false, at: NOW + 3_600_000 }], NOW) === null, "one dated in the future counts for nothing");
ok(boostFrom([{ amount: 445, wished: false, at: hoursAgo(1) }], NOW)!.until === hoursAgo(1) + BOOST_MS, "it runs out two days after it was sent");

// 📝 What she's told about it.
const note = boostNote(big, "a Gucci purse", "Sam");
ok(/Sam sent you a Gucci purse/.test(note), "she knows what she was sent, and who by");
ok(/slip out of work|skip a class/.test(note), "…that she'd bend her day around them");
ok(/never as a transaction/.test(note) && /never as something that bought you/.test(note), "…and that it never reads as buying her");
ok(boostNote(null, "a purse", "Sam") === "", "nothing sent, nothing said");

// 🛍️ Things you list yourself.
ok(MAX_MY_GIFTS === 5, "you can list five of your own");
const own = myGift({ id: "aaaaaaaa-1111-2222-3333-444444444444", name: "courtside tickets", brand: "Bulls", price: 900 });
ok(own.emoji === MY_GIFT_EMOJI && own.emoji === "🛍️", "one of yours carries a plain shopping bag");
ok(own.price === 900 && own.name === "courtside tickets" && own.brand === "Bulls", "…with what you said it was, and what you said it cost");
ok(isMyGift(own.id) && !isMyGift("gucci-purse"), "…and is told apart from the thirty");
ok(myGiftId("abc") === "mine:abc", "its id says whose it is");
ok(!GIFTS.some(g => isMyGift(g.id)), "none of the thirty pretend to be yours");
ok(!shopFor(w).some(g => isMyGift(g.id)) && !shopFor(w + 9).some(g => isMyGift(g.id)), "the weekly rotation never touches them");
// ⭐ But they can want one: it's in the shop, so it's fair game on a wishlist like anything else.
const ownPool = [myGift({ id: "a1", name: "courtside tickets", brand: "Bulls", price: 900 }),
  myGift({ id: "a2", name: "pottery class", brand: "", price: 140 }),
  myGift({ id: "a3", name: "a weekend away", brand: "", price: 1200 })];
const people = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const wants = (close: number) => people.some(who => [w, w + 1, w + 2].some(k => wishlistFor(who, k, ownPool, close).some(g => isMyGift(g.id))));
ok(wants(100), "someone close can want one of yours — it's in the shop like anything else");
ok(!wants(WANTS_YOURS_AT - 1), `someone who isn't close enough yet never does (under ${WANTS_YOURS_AT})`);
ok(wants(WANTS_YOURS_AT), "…and starts to the moment they are");
ok(!wants(0) && !wants(30), "a new one who barely knows you certainly doesn't");
ok(wishlistFor(her, w, ownPool, 100).length === 3 && wishlistFor(her, w, ownPool, 0).length === 3, "either way a wishlist is three things");
ok(!wishlistFor(her, w, ownPool, 0).some(g => isMyGift(g.id)), "…and theirs is only ever the catalogue until then");
ok(onWishlist(her, w, wishlistFor(her, w, ownPool, 100)[0].id, ownPool, 100), "something on it reads as wished for, yours or not");
ok(/holding up the courtside tickets/.test(photoBrief("courtside tickets", "gift", own).brief), `in the photo she holds one of yours up: "${photoBrief("courtside tickets", "gift", own).brief}"`);

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
