// 🏡 Ordinary people: six of them, all adults, none of them influencers.
import { FOLKS, folkNote, folkMemory, FOLK_SUGGESTIVE } from "../app/lib/folks.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

ok(FOLKS.length === 6, "six of them");
ok(new Set(FOLKS.map(f => f.key)).size === 6, "each one turns up once (no repeated keys)");
ok(FOLKS.every(f => f.tie === "character" || f.tie === "you"), "each is tied to a character or to you");
ok(FOLKS.filter(f => f.tie === "character").length === 2, "two of them come through someone you know");

const note = folkNote(FOLKS.find(f => f.key === "sister")!, "Allie");
ok(/Allie's younger sister/.test(note), "the sister is written as that character's sister");
ok(/SHE IS AN ADULT/.test(note) && /never described in a sexual or suggestive way/.test(note), "…as an adult, never suggestively");
ok(/not an influencer or a model/.test(note) && /bad lighting/.test(note), "…and her photos are a normal person's photos");
ok(!/\{NAME\}/.test(note), "the name is filled in, not left as a placeholder");
ok(FOLKS.every(f => f.followers[0] >= 100 && f.followers[1] <= 10000), "small followings, like real people");
ok(FOLK_SUGGESTIVE <= 1, "they're not the ones doing the sensual shots");
ok(/@mollyb/.test(folkMemory(FOLKS[0], "Molly Byrne", "mollyb", "Allie")), "the one she's tied to is told her handle");

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
