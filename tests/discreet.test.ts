// 🤫 A private present lands differently depending on what the two of you are.
import { takeOn, photoOk, discreetNote, CLOSE_ENOUGH } from "../app/lib/discreet.ts";
import { GIFTS, isDiscreetGift, wishlistFor, DISCREET_WANTED_AT } from "../app/lib/gifts.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 💞 Together, close, and she flirts: she's glad, and says so.
ok(takeOn({ romantic: true, closeness: 80, flirty: 6, happy: 70 }) === "glad", "someone close and flirty is glad to get one");
// 🌱 Together but early days: pleased and a bit shy.
ok(takeOn({ romantic: true, closeness: 30, flirty: 6, happy: 70 }) === "shy", "someone newer is pleased but shy about it");
ok(takeOn({ romantic: true, closeness: 80, flirty: 1, happy: 70 }) === "shy", "…and so is someone who doesn't flirt");
ok(takeOn({ romantic: true, closeness: 80, flirty: 6, happy: 20 }) === "shy", "…and someone you've hurt doesn't swoon over it");
// 🙅 Not together at all: a surprise, whoever she is.
ok(takeOn({ romantic: false, closeness: 95, flirty: 9, happy: 90 }) === "surprised", "a friend is surprised, however well she knows you");
ok(takeOn({ romantic: false, closeness: 5, flirty: 0, happy: 50 }) === "surprised", "…and so is someone who barely knows you");

// 📸 She doesn't send a picture of something she didn't want.
ok(!photoOk("surprised"), "no picture when it wasn't welcome");
ok(photoOk("glad") && photoOk("shy"), "…but one either way when it was");

// 💬 What her prompt is told.
const surprised = discreetNote("surprised", "Sam", false);
ok(/caught off guard/.test(surprised) && /what made them send/.test(surprised), "a surprised one is told to ask why");
ok(!/flirty back/.test(surprised.replace("do not be flirty back", "")), "…and not to flirt back");
for (const t of ["glad", "shy", "surprised"] as const)
  ok(/stays between the two of you/.test(discreetNote(t, "Sam", true)), `${t}: she keeps it to herself either way`);
ok(/never explicit/.test(discreetNote("glad", "Sam", true)), "the glad one is still held to PG-13");

// 🛍️ There are some to send, and they are their own kind.
const ours = GIFTS.filter(g => isDiscreetGift(g));
ok(ours.length >= 6, `the shop has private ones to send (${ours.length})`);
ok(ours.every(g => g.price >= 1), "…all with a price");

// 💭 Nobody who isn't close is hoping for one out loud.
let farWishes = 0, closeWishes = 0;
for (let i = 0; i < 300; i++) {
  if (wishlistFor(`her${i}`, 5, [], 20).some(isDiscreetGift)) farWishes++;
  if (wishlistFor(`her${i}`, 5, [], 95).some(isDiscreetGift)) closeWishes++;
}
ok(farWishes === 0, `someone not close never puts one on her list (${farWishes} of 300)`);
ok(closeWishes > 0, `someone close might (${closeWishes} of 300)`);
ok(CLOSE_ENOUGH < DISCREET_WANTED_AT, "she'll happily receive one before she'd ask for one");

console.log(bad ? `\n${bad} failed` : "\nall good");
if (bad) process.exitCode = 1;
