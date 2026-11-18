// Run: node --experimental-strip-types tests/attached.test.ts
import { attachedNote, lesbianNote, together, busyWithTheirs, endedNote, RING, SAPPHIC, type Her } from "../app/lib/attachedWords.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const her = (o: Partial<Her>): Her => ({ id: "x", name: "Nia", attached: "single", romantic: true, ...o });
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

// 💍 Married, and something quiet with you.
const wed = attachedNote(her({ attached: "married", partner: "Marcus", attached_since: ago(900) }), "Sam");
ok(/YOU'RE MARRIED \(Marcus\)/.test(wed) && /about 2 years/.test(wed), "a marriage knows who and how long");
ok(/secret/.test(wed) && /where you'd be seen/.test(wed), "…and that what's with you stays quiet");
ok(/slower to fall/.test(wed) && /means more when you do/.test(wed), "…she takes longer to fall, and it counts for more");
ok(/Never ask Sam to wait for you/.test(wed) && /never make threats or promises about leaving/.test(wed), "…no waiting-for-me, no promises about leaving");
const wedPlatonic = attachedNote(her({ attached: "married", romantic: false }), "Sam");
ok(/not available/.test(wedPlatonic) && !/secret/.test(wedPlatonic), "married and not romantic with you: simply unavailable, nothing furtive");

// 💘 Seeing someone, short-term.
const dating = attachedNote(her({ attached: "dating", partner: "Jay", attached_since: ago(21) }), "Sam");
ok(/YOU'RE SEEING SOMEONE \(Jay\)/.test(dating) && /about 3 weeks/.test(dating), "a new thing knows who and how long");
ok(/isn't forever/.test(dating) && /more quietly/.test(dating) && /conflicted/.test(dating), "…short-term, quieter with you, and conflicted");
ok(/not free because you're with them/.test(dating), "…and some nights she isn't free");
ok(/unless you were already in deep/.test(dating), "…unless she was already yours, and then it's the other way round");
ok(/Never cruel/.test(dating) && /never punish Sam/.test(dating), "…never cruel, never punishing");
ok(attachedNote(her({}), "Sam") === "", "single says nothing at all");

// ⏳ How long, in words.
ok(together(ago(5)) === "a couple of weeks" && together(ago(40)) === "about 6 weeks" && together(ago(200)) === "about 7 months", `time together reads naturally (${together(ago(5))} / ${together(ago(40))} / ${together(ago(200))})`);
ok(together(null) === "" && together(undefined) === "", "and nothing when there's no date");

// ⚢ Into women.
const les = lesbianNote(her({ lesbian: true }), "Sam", false);
ok(les.startsWith(SAPPHIC) && /that's where nearly all of it goes/.test(les), "she flirts with women far more than with you at first");
ok(/not interested that way, and you say so lightly rather than cruelly/.test(les), "…a light no, never a cruel one");
ok(/That isn't fixed/.test(les) && /earned over many conversations, never in one/.test(les), "…but she can be won round, slowly");
ok(/say so plainly in your own words once/.test(les), "…and saying so is what changes it");
ok(/far easier door/.test(lesbianNote(her({ lesbian: true }), "Sam", true)), "poly makes a woman-and-you easier than you alone");

// 🎲 Out with them now and then — not often, and never if she's single.
const outs = Array.from({ length: 2000 }, () => busyWithTheirs(her({ attached: "dating" }))).filter(Boolean).length / 2000;
ok(outs > 0.1 && outs < 0.3, `she's out with them about one time in five (${Math.round(outs * 100)}%)`);
ok(!Array.from({ length: 300 }, () => busyWithTheirs(her({}))).some(Boolean), "a single woman is never busy with somebody else");
ok(!Array.from({ length: 300 }, () => busyWithTheirs(her({ attached: "married" }))).some(Boolean), "and a married one doesn't beg off with that excuse");

// 💔 When it ends.
ok(/YOUR MARRIAGE HAS ENDED \(Marcus\)/.test(endedNote("divorced", "Marcus")) && /don't ask them for anything/.test(endedNote("divorced", "")), "a divorce is told in her own time, asking you for nothing");
ok(/HAVE ENDED IT/.test(endedNote("ended", "Jay")) && /lightly/.test(endedNote("ended", "Jay")), "a short thing ending is mentioned lightly");
ok(RING === "💍" && SAPPHIC === "⚢", "the ring and the two circles are what shows on her chip");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
