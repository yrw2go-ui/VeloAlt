// 🎁 Buy one they wanted and it leaves the list — a new one takes its place, always three.
import { wishlistFor, onWishlist, GIFTS } from "../app/lib/gifts.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

const WHO = "her-1", WEEK = 12;
const ids = (l: { id: string }[]) => l.map(g => g.id);

const first = wishlistFor(WHO, WEEK, [], 100);
ok(first.length === 3, `three things to start with (${first.length})`);

// 🎀 You buy the first of them.
const bought = first[0].id;
const after = wishlistFor(WHO, WEEK, [], 100, new Set([bought]));
ok(after.length === 3, `still three afterwards (${after.length})`);
ok(!ids(after).includes(bought), "the one you bought is gone");
ok(ids(after).includes(first[1].id) && ids(after).includes(first[2].id), "…the other two stay put");
const fresh = ids(after).filter(id => !ids(first).includes(id));
ok(fresh.length === 1, `…and one new one takes its place (${fresh.join(", ")})`);

// 🎀 Buy that one too, and the next one down comes up.
const after2 = wishlistFor(WHO, WEEK, [], 100, new Set([bought, after[0].id === bought ? after[1].id : fresh[0]]));
ok(after2.length === 3, `three again after a second present (${after2.length})`);

// 🧺 Give her a dozen and the list still fills.
const twelve = new Set(ids(wishlistFor(WHO, WEEK, [], 100)).concat(GIFTS.slice(0, 12).map(g => g.id)));
ok(wishlistFor(WHO, WEEK, [], 100, twelve).length === 3, "a dozen presents later it is still three");
ok(ids(wishlistFor(WHO, WEEK, [], 100, twelve)).every(id => !twelve.has(id)), "…none of them already given");

// 💭 The list is still steady when nothing has been bought — same three each time you look.
ok(ids(wishlistFor(WHO, WEEK, [], 100)).join() === ids(first).join(), "the list doesn't shuffle on its own");
// 🙋 And it is still per person: someone else wants her own things.
ok(ids(wishlistFor("her-2", WEEK, [], 100)).join() !== ids(first).join(), "someone else wants different things");

// ✅ Sending one still counts as wished-for, judged before it is given.
ok(onWishlist(WHO, WEEK, bought, [], 100, new Set()), "the one you are buying still counts as wished for");
ok(!onWishlist(WHO, WEEK, bought, [], 100, new Set([bought])), "…and not any more once she has it");

console.log(bad ? `\n${bad} failed` : "\nall good");
if (bad) process.exitCode = 1;
