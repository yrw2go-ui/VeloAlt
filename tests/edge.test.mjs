// Phone width: every tab stays inside the screen. A toolbar that sticks out is what makes
// Android draw the whole page small.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

let chromium;
for (const from of [join(root, "node_modules/playwright/package.json"), "/tmp/node_modules/playwright/package.json"]) {
  try { chromium = createRequire(from)("playwright").chromium; break; } catch { /* next */ }
}
if (!chromium) { console.error("FAIL playwright is not installed"); process.exit(1); }

const chip = (n) => `<button style="flex-shrink:0;padding:6px 12px;border-radius:999px;white-space:nowrap">${n}</button>`;
const tabs = {
  Chat: `<div class="row" style="padding:10px 12px;gap:8px"><b>Velo 2</b><span style="flex:1"></span><button class="btn" style="white-space:nowrap">📞 Call</button></div>
    <div class="card">What are you up to?</div>`,
  Picagram: `<div class="row" data-testid="pica-bar" style="padding:10px 14px;gap:8px"><div style="flex:1;font-size:24px;font-weight:900">Picagram</div>
    <button class="ghost" style="padding:6px 10px">✉️</button><button class="ghost" style="padding:6px 10px">👥</button>
    <button class="ghost" style="padding:6px 10px">🙋</button><button class="ghost" style="padding:6px 10px">👩</button>
    <button class="ghost" style="padding:6px 10px">🔖</button><button class="ghost" style="padding:6px 10px">↻</button>
    <button class="btn" style="padding:8px 14px">＋ Post</button></div>
    <article class="card" style="margin:8px 0">A post that spans the screen</article>`,
  Gifts: `<div style="width:100%;min-width:0;max-width:100%;padding:14px"><div class="card"><div class="row" style="justify-content:space-between"><span>💳 To spend</span><b>$240</b></div>
    <div class="row"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⭐ A weekend bag → Jordan</span><span style="white-space:nowrap">$80</span></div></div></div>`,
  Today: `<div style="width:100%;padding:16px"><section class="card"><b>⏰ Reminders</b><div class="row"><div style="flex:1">Stretch at 3pm</div><button class="ghost">Done</button></div></section></div>`,
  Memory: `<div style="width:100%;padding:16px"><section class="card"><b>💡 Things Velo knows about you</b><div>Lives in Austin</div></section></div>`,
  Settings: `<div style="width:100%;min-width:0;padding:16px;display:flex;flex-direction:column;gap:12px">
    <div class="card"><b>What should Velo call you?</b></div>
    <div class="card"><b>🧠 Brains</b><div style="display:flex;gap:6px;max-width:100%;overflow-x:auto">${["Velo","Hailey","Allie","Maya","Sofia","Jordan","Priya","Elena"].map(chip).join("")}</div></div>
    <div class="card">Photo wording</div></div>`,
};
const nav = ["Chat","Picagram","Gifts","Today","Memory","Settings"].map(t => `<button style="flex:1 1 0;min-width:0;max-width:100%;overflow:hidden;background:none;border:none;padding:10px 0;font-size:12px;font-weight:700">${t}</button>`).join("");

function page(which) {
  return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover">
<style>${css}</style>
<div id="shell" style="height:100dvh;display:flex;flex-direction:column;width:100%;min-width:0;max-width:min(720px,100%);margin:0 auto">
<main style="flex:1;min-width:0;width:100%;max-width:100%;overflow-x:clip;overflow-y:auto">${tabs[which]}</main>
<nav style="display:flex;width:100%;min-width:0;max-width:100%">${nav}</nav></div>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let bad = 0;
for (const width of [360, 393, 412]) {
  for (const name of Object.keys(tabs)) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.setContent(page(name));
    const m = await pg.evaluate(() => {
      const clips = (el) => {
        let n = el.parentElement;
        while (n && n !== document.body) {
          const s = getComputedStyle(n);
          const box = n.getBoundingClientRect();
          // A sideways scroller (the Brains chips) may hold items past the screen. A page-level clip does not.
          if ((s.overflowX === "auto" || s.overflowX === "scroll") && box.right <= window.innerWidth + 1 && box.left >= -1) return true;
          n = n.parentElement;
        }
        return false;
      };
      const wide = [...document.querySelectorAll("body *")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1 && !clips(el);
      }).slice(0, 6).map(el => `${el.tagName}.${el.className || ""}@${Math.round(el.getBoundingClientRect().right)}`);
      const shell = document.getElementById("shell").getBoundingClientRect();
      return { inner: window.innerWidth, scroll: document.documentElement.scrollWidth, scale: window.visualViewport ? window.visualViewport.scale : 1, shell: Math.round(shell.width), left: Math.round(shell.left), wide };
    });
    const pass = m.inner === width && m.scroll === width && m.scale === 1 && m.shell === width && m.left === 0 && m.wide.length === 0;
    console.log((pass ? "PASS " : "FAIL ") + `${name} @ ${width} inner=${m.inner} scroll=${m.scroll} scale=${m.scale} shell=${m.shell} wide=${m.wide.join(",") || "none"}`);
    if (!pass) bad++;
    await ctx.close();
  }
}
await browser.close();
console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
