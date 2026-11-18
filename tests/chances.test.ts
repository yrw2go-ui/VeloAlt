// 💕 A man's own love life: who could ever go anywhere, and who turns him down.
import { hisChances } from "../app/lib/chances.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const man = { voice_kind: "male", romantic: true };
const know = [
  { name: "Mara", sees_others: true, voice_kind: "female", kind: "friends", relation: "" },
  { name: "Chloe", sees_others: false, voice_kind: "female", kind: "friends", relation: "" },
  { name: "Ruth", sees_others: true, voice_kind: "female", kind: "sister", relation: "" },
  { name: "Dan", sees_others: true, voice_kind: "male", kind: "friends", relation: "" },
];
const t = hisChances(man, know, true, "Sam");
ok(/Open to it: Mara\./.test(t), "a woman he knows who might see someone else is open to him");
ok(/Not open to it: Chloe\./.test(t), "one who isn't turns him down");
ok(!/Ruth/.test(t), "his sister is on neither list");
ok(!/Dan/.test(t), "nor are the men he knows");
ok(/never Sam/.test(t), "and never the person he's talking to");
ok(/firsthand/.test(t) && /only heard of/.test(t), "only women he's actually met count");
ok(hisChances({ voice_kind: "female", romantic: true }, know, true, "Sam") === "", "a woman's card is untouched by this");
ok(hisChances(man, know, false, "Sam") === "", "nothing at all without the grown-up setting");
ok(hisChances({ voice_kind: "male", romantic: false }, know, true, "Sam") === "", "nor with 💕 unticked");
const none = hisChances(man, [{ name: "Chloe", sees_others: false, voice_kind: "female" }], true, "Sam");
ok(!/Open to it/.test(none) && /Not open to it: Chloe/.test(none), "no one open: only the turn-downs are listed");
// 💞 Poly on a man's card: he's fine sharing a woman with you.
const poly = hisChances({ voice_kind: "male", romantic: true, poly_ok: true }, know, true, "Sam");
ok(/DON'T MIND SHARING/.test(poly) && /you don't compete for her/.test(poly), "poly ticked: he'll share a woman with you");
ok(!/DON'T SHARE:/.test(poly), "…and isn't also told the opposite");
const solo = hisChances({ voice_kind: "male", romantic: true }, know, true, "Sam");
ok(/DON'T SHARE:/.test(solo) && /never an ultimatum/.test(solo), "unticked: he doesn't share, but never nasty about it");
