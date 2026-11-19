// The locked adult line is what the file ships, and saved overrides are skipped.
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../app/lib/words.ts", import.meta.url), "utf8");
let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

ok(src.includes('label: "No real people, and everyone\'s an adult"'), "locked label names the adult rule");
ok(src.includes("Never a real or famous person — everyone is fictional, and every one of them is an adult."), "locked text says everyone is an adult");
ok(src.includes('key: "safety_locked"') && /safety_locked[\s\S]{0,400}fixed: true/.test(src), "the slot stays locked");
const skips = src.split("if (locked(k)) continue;").length - 1;
ok(skips >= 2, "merge and keepEdits both ignore a saved locked line");
ok(!src.includes('text: "Never a real or famous person — everyone is fictional."'), "the shortened line is not the default");

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
