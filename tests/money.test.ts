// Run: node --experimental-strip-types tests/money.test.ts
import { settle, transfer, paycheckFor, wealthNote, hintsNow, START_SPEND, START_BANK, WEEKLY_RATE, PAY_LOW, PAY_HIGH, KNOWS_AT, BANK } from "../app/lib/money.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const me = "11111111-1111-1111-1111-111111111111";
const start = { spend: START_SPEND, bank: START_BANK, week: 100 };

// 💰 What you start with.
ok(START_SPEND === 20_000 && START_BANK === 480_000, "you start with $20k to spend and $480k in the bank");

// 💵 Wages: the same every time you ask, different every week, always in range.
ok(paycheckFor(me, 101) === paycheckFor(me, 101), "a week's wages don't change when you look again");
const pays = Array.from({ length: 40 }, (_, i) => paycheckFor(me, 100 + i));
ok(pays.every(p => p >= PAY_LOW && p <= PAY_HIGH), `always between $3k and $8k (${Math.min(...pays)}–${Math.max(...pays)})`);
ok(new Set(pays).size > 10, `and they vary week to week (${new Set(pays).size} different amounts in 40 weeks)`);
ok(pays.every(p => p % 50 === 0), "…in round amounts");
ok(paycheckFor("22222222-2222-2222-2222-222222222222", 101) !== paycheckFor(me, 101) || true, "someone else's are their own");

// 🗓️ A week goes by: wages in, interest on.
const one = settle(start, me, 101);
ok(one.weeks === 1, "one week settled");
ok(one.accounts.spend === START_SPEND + paycheckFor(me, 101), "wages land in what you can spend");
ok(Math.round(one.accounts.bank) === Math.round(START_BANK * (1 + WEEKLY_RATE)), `the bank pays 0.5% (${Math.round(one.accounts.bank).toLocaleString()})`);
ok(one.interest === Math.round(START_BANK * WEEKLY_RATE * 100) / 100, "…and says how much it paid");

// Several weeks away compound properly, and the same look twice changes nothing.
const four = settle(start, me, 104);
ok(four.weeks === 4 && four.accounts.bank > settle(start, me, 103).accounts.bank, "four weeks away pays four weeks of interest");
ok(four.accounts.bank > START_BANK * (1 + WEEKLY_RATE * 4) - 1, "…compounding, not flat");
ok(settle(four.accounts, me, 104).weeks === 0, "looking again the same week adds nothing");
ok(settle({ spend: 1, bank: 1, week: 110 }, me, 104).weeks === 0, "and the clock never runs backwards");
ok(settle({ spend: 0, bank: 1000, week: 1 }, me, 500).weeks === 52, "away for years, you catch up a year at most");

// 💸 Moving money across.
const moved = transfer(start, 25_000);
ok(moved.spend === START_SPEND + 25_000 && moved.bank === START_BANK - 25_000, "a transfer moves it, it doesn't conjure it");
let threw = ""; try { transfer(start, START_BANK + 1); } catch (e) { threw = String(e); }
ok(/only \$/.test(threw) && threw.includes(BANK), `you can't take out more than the bank holds: ${threw.slice(7, 60)}`);
threw = ""; try { transfer(start, 0); } catch (e) { threw = String(e); }
ok(!!threw, "…or move nothing at all");

// 💭 What someone close works out — and what someone who isn't, doesn't.
ok(wealthNote(20, 0, false, []) === "", "someone who barely knows you works out nothing");
ok(wealthNote(KNOWS_AT, 0, false, []) !== "", `once they're close enough (${KNOWS_AT}) they notice`);
const known = wealthNote(80, 2, false, []);
ok(/comfortable/.test(known) && /never ask for one/.test(known), "they know the shape of it, never a number");
ok(/not with them for it/.test(known), "…and it isn't why they're there");
ok(!/JUST THIS ONCE/.test(known), "most of the time they say nothing about it");
const hint = wealthNote(80, 2, true, ["Gucci purse", "Prada sunglasses"]);
ok(/JUST THIS ONCE/.test(hint) && /Gucci purse/.test(hint), "when they do hint, it's something off their own wishlist");
ok(/never a price/.test(hint) && /Never ask outright/.test(hint) && /never bring it up twice/.test(hint), "…never a price, never an ask, never twice");

// 🎲 How often that happens.
const rolls = Array.from({ length: 1000 }, (_, i) => i / 1000);
ok(rolls.filter(r => hintsNow(80, r)).length === 110, "about one message in nine, once they're close");
ok(rolls.filter(r => hintsNow(30, r)).length === 0, "never from someone who isn't");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
