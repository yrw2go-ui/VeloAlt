// 🏷️ Two things are reduced every week, each by a different amount.
//
// The week decides it, so the shop you open on the Monday is the shop you open on the Friday — and
// next week it is two other things. What is taken off is really taken off: the price in the shop IS
// the price, with what it was before beside it.
import { GIFTS, shopFor, weekOf, salesFor, salePrice, reduced, SALE_COUNT, SALE_MIN, SALE_MAX } from "../app/lib/gifts.ts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

const w = weekOf(Date.parse("2026-11-18T12:00:00Z"));
const onSale = (week: number) => shopFor(week).filter(g => g.off);

// Two of them, every week, for a good run of weeks.
for (const i of [0, 1, 2, 3, 9, 40]) {
  const s = onSale(w + i);
  ok(s.length === SALE_COUNT, `week ${i}: two things reduced (${s.map(g => `${g.name} ${g.off}% off`).join(", ") || "none"})`);
  ok(s.every(g => g.off! >= SALE_MIN && g.off! <= SALE_MAX), `week ${i}: between a tenth and a quarter off`);
  ok(new Set(s.map(g => g.off)).size === s.length, `week ${i}: each one a different amount`);
}

// The same week is always the same sale; a different week is a different one.
ok(JSON.stringify(onSale(w)) === JSON.stringify(onSale(w)), "the same week always has the same sale");
const runs = Array.from({ length: 20 }, (_, i) => onSale(w + i).map(g => g.id).join("+"));
ok(new Set(runs).size > 5, `and it moves about from week to week (${new Set(runs).size} different pairs in 20 weeks)`);

// What it costs now, and what it cost before.
for (const g of onSale(w)) {
  ok(g.price < g.was!, `${g.name}: $${g.price} is less than the $${g.was} it was`);
  ok(g.price === salePrice(g.was!, g.off!), `${g.name}: the price is the old one less ${g.off}%`);
  ok(g.price >= 1, `${g.name}: never free`);
}

// Everything else is its plain self, with nothing struck through.
for (const g of shopFor(w).filter(x => !x.off)) ok(g.was === undefined, `${g.name} isn't on sale, so there's no "was"`);

// Only things actually in the shop can be reduced.
for (const i of [0, 5, 11]) {
  const stock = new Set(shopFor(w + i).map(g => g.id));
  ok(onSale(w + i).every(g => stock.has(g.id)), `week ${i}: nothing is reduced that isn't there to buy`);
}

// The maths on its own.
ok(salePrice(100, 25) === 75, "a quarter off a hundred is seventy-five");
ok(salePrice(99, 10) === 89, "a tenth off ninety-nine is eighty-nine");
ok(salePrice(8, 25) === 6, "and a quarter off the ice cream still costs something");
ok(reduced(GIFTS[0]).off === undefined, "a gift with nothing off it is left exactly alone");
ok(salesFor(w, []).size === 0, "an empty shop has no sale");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
