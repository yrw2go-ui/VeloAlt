// Run: node --experimental-strip-types tests/slang.test.ts
import { SLANG, VELO_SLANG } from "../app/lib/slang.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
// 💬 Shorthand everyone should just understand.
const slang = SLANG;
for (const s of ["brb", "idk", "gtg", "ttyl", "ily", "hmu", "wyd", "nvm", "tbh", "lmk", "ngl", "iykyk", "omw"])
  ok(new RegExp(`\\b${s}\\b`).test(slang), `"${s}" is spelled out for them`);
for (const s of ["sus", "lowkey", "no cap", "mid", "rizz", "delulu", "situationship", "ghosted", "touch grass"])
  ok(slang.includes(s), `…and the slang "${s}"`);
ok(/never ask what it means/.test(slang) && /never explain it back/.test(slang), "they never ask what one means or explain it back");
ok(/never read it as a typo/.test(slang), "…and never take one for a typo");
ok(/only if it fits who you are/.test(slang), "using it themselves is still up to who they are");

// 🤖 Velo knows it too.
const velo = VELO_SLANG;
ok(/brb/.test(velo) && /idk/.test(velo) && /rizz/.test(velo), "Velo understands the same shorthand and slang");
ok(/never ask what one means/.test(velo), "…and doesn't ask what they mean either");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
