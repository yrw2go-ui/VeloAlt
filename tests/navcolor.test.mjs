// 🍷 The bottom tab bar is deep burgundy, and its labels stay readable on it.
// Checked against the real files, with the browser resolving the colours.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const page = readFileSync(join(root, "app/page.tsx"), "utf8");

let chromium;
for (const from of [join(root, "node_modules/playwright/package.json"), "/tmp/node_modules/playwright/package.json"]) {
  try { chromium = createRequire(from)("playwright").chromium; break; } catch { /* next */ }
}
if (!chromium) { console.error("FAIL playwright is not installed"); process.exit(1); }

let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// 1️⃣ The bar's colours are wired to the tokens, not left on the old blue-grey ones.
const navTag = (page.match(/<nav style=\{\{[^}]*\}\}/) || [""])[0];
ok(/background: "var\(--nav-bg\)"/.test(navTag), "the bar takes its colour from --nav-bg");
ok(/borderTop: "1px solid var\(--nav-border\)"/.test(navTag), "…and its top line from --nav-border");
ok(!/var\(--surface\)/.test(navTag), "…and no longer from the old surface colour");
ok(/tab === t\.id \? "var\(--nav-active\)" : "var\(--nav-muted\)"/.test(page), "the labels take theirs from --nav-active / --nav-muted");

// 2️⃣ Let the browser resolve them, then check the shade and the contrast for real.
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.setContent(`<style>${css}</style><div id="x"></div>`);
const read = async v => p.evaluate(n => {
  const e = document.getElementById("x"); e.style.color = `var(${n})`;
  return getComputedStyle(e).color;
}, v).then(s => s.match(/\d+/g).slice(0, 3).map(Number));
const bg = await read("--nav-bg"), active = await read("--nav-active"), muted = await read("--nav-muted"), line = await read("--nav-border");
await b.close();

ok(bg[0] > bg[1] && bg[0] > bg[2], `the bar is red, not blue (rgb ${bg})`);
ok(lum(bg) < 0.06, `…and deep, not bright (luminance ${lum(bg).toFixed(3)})`);
ok(bg[0] >= 55 && bg[0] <= 115 && bg[1] < 45 && bg[2] < 65, `…a burgundy rather than a scarlet (rgb ${bg})`);
ok(line[0] > bg[0], `the top line is a lighter shade of the same red (rgb ${line})`);
ok(ratio(active, bg) >= 4.5, `the tab you're on reads clearly on it (${ratio(active, bg).toFixed(1)}:1)`);
ok(ratio(muted, bg) >= 4.5, `…and so do the rest (${ratio(muted, bg).toFixed(1)}:1)`);
ok(ratio(active, bg) > ratio(muted, bg), "…with the one you're on standing out most");

// 3️⃣ Nothing else went red.
ok(/--bg: #0b0d17/.test(css) && /--surface: #141828/.test(css), "the page and its cards are untouched");

console.log(bad ? `${bad} failed` : "all good");
process.exitCode = bad ? 1 : 0;
