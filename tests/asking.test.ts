// ❓ How often she asks you something.
import { askRate } from "../app/lib/asking.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const mid = { energetic: 5, coldness: 5, love: 5, moody: 5 };
const warm = { energetic: 9, coldness: 1, love: 8, moody: 5 };
const cold = { energetic: 2, coldness: 9, love: 2, moody: 5 };
const r = (t: Record<string, number>, n: number) => Math.round(askRate(t, n) * 100);
ok(r(mid, 200) === 50, `a middling character lands on a coin flip (${r(mid, 200)}%)`);
ok(r(warm, 200) >= 65 && r(warm, 200) <= 80, `hyper and warm asks more (${r(warm, 200)}%)`);
ok(r(cold, 200) >= 25 && r(cold, 200) <= 42, `cold and standoffish asks much less (${r(cold, 200)}%)`);
ok(r(mid, 4) > r(mid, 200), `the first messages ask more (${r(mid, 4)}% vs ${r(mid, 200)}%)`);
ok(r(mid, 20) > r(mid, 200) && r(mid, 20) < r(mid, 4), `…easing off as you get to know each other (${r(mid, 20)}%)`);
ok(r(warm, 2) <= 80 && r(cold, 2) >= 25, "…and never all-or-nothing, however new");
ok(askRate(null, 50) > 0 && askRate(undefined, 50) < 1, "a character with no sliders still works");
