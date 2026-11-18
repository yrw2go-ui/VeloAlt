// Run: node --experimental-strip-types tests/spoiled.test.ts
import { chanceOfYes } from "../app/lib/willing.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const pc = (n: number) => `${Math.round(n * 100)}%`;

// 🎁 At work or in class, she usually can't. After a present, she'll take the chance.
const workPlain = chanceOfYes(60, 50, true, 0, 0);
const workSpoiled = chanceOfYes(60, 50, true, 0, 1);
ok(workSpoiled > workPlain, `at work she's far likelier to sneak one in (${pc(workPlain)} → ${pc(workSpoiled)})`);
ok(workSpoiled > 0.6, `…better than even odds (${pc(workSpoiled)})`);
ok(workPlain < 0.45, `…whereas normally she mostly can't (${pc(workPlain)})`);

// A smaller present helps less than a big one.
const workSome = chanceOfYes(60, 50, true, 0, 0.4);
ok(workSome > workPlain && workSome < workSpoiled, `a smaller one helps less (${pc(workSome)})`);

// 🏡 Free anyway: she was nearly always going to say yes, so there's little room to move.
const freePlain = chanceOfYes(60, 50, false, 0, 0);
const freeSpoiled = chanceOfYes(60, 50, false, 0, 1);
ok(freeSpoiled >= freePlain && freeSpoiled <= 0.98, `when she's free it barely moves (${pc(freePlain)} → ${pc(freeSpoiled)})`);

// 💔 Still sore: a present helps, but it never erases it.
const sorePlain = chanceOfYes(60, 50, false, 3, 0);
const soreSpoiled = chanceOfYes(60, 50, false, 3, 1);
ok(soreSpoiled > sorePlain, "a present helps when she's still sore");
ok(soreSpoiled <= chanceOfYes(60, 50, false, 0, 1), "…without wiping away what happened");

// Nothing ever becomes certain, and a bad mood still shows.
ok(chanceOfYes(100, 100, false, 0, 1) <= 0.98, "she's never a certainty");
ok(chanceOfYes(10, 0, true, 5, 0) >= 0.1, "…and never flatly impossible either");
ok(chanceOfYes(20, 10, false, 0, 1) < chanceOfYes(95, 95, false, 0, 1), "how she feels still counts, present or no present");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
