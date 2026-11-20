// 🧠 One brain, from Settings — plus a backup only when one is switched on. And comments,
// which are many and cheap, never going to the dearest brain.
import { brainOrder, retryChoices, befriendChoices, roughCost, commentBrains, BACKUP_OPTIONS } from "../app/lib/pickBrain.ts";
import { QUICK, quickComment } from "../app/lib/picaComments.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const same = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}`);

// Nothing picked is Claude; a backup only counts when one is set.
same(brainOrder("", ""), ["claude"], "nothing picked → Claude alone");
same(brainOrder("claude", ""), ["claude"], "Claude picked → Claude alone");
same(brainOrder("qwen", ""), ["qwen"], "Qwen picked, no backup → Qwen alone, never Claude behind it");
same(brainOrder("qwen", "claude"), ["qwen", "claude"], "Qwen with Claude as backup → that order");
same(brainOrder("qwen", "qwen"), ["qwen"], "a backup that is the same brain is not tried twice");
same(brainOrder("deepseek", "qwen"), ["deepseek", "qwen"], "any two can be paired");

// The retry list after a brain couldn't manage: never the one that just failed, each with a cost.
const r = retryChoices("qwen", ["qwen", "qwen2", "deepseek", "kimi"]);
ok(!r.some(c => c.id === "qwen"), "a retry never offers the brain that just failed");
ok(r.some(c => c.id === "claude"), "…and Claude is always offerable");
ok(r.every(c => !!c.cost && !!c.label), "…every choice says what it is and roughly what it costs");
same(retryChoices("claude", []).map(c => c.id), [], "nothing else set up → nothing to offer");
ok(/¢|penny/.test(roughCost("claude")) && /¢|penny/.test(roughCost("qwen")), "costs read as money");
ok(roughCost("claude") !== roughCost("qwen"), "…and Claude is not priced the same as Qwen");

// Backups on offer, and comments going to the cheap brains, cheapest first.
same(BACKUP_OPTIONS.map(o => o.id), ["claude", "qwen", "deepseek"], "the backup choices");
same(commentBrains(["qwen", "qwen2", "deepseek", "kimi"]), ["qwen", "deepseek", "kimi"], "comments: cheapest first, and never Claude");
same(commentBrains(["kimi"]), ["kimi"], "…only what's actually set up");
same(commentBrains([]), [], "…and nobody at all when none is: the free lines do it");

// The free pool: about a hundred short lines that cost nothing.
ok(QUICK.length >= 100, `about a hundred free comments (${QUICK.length})`);
ok(QUICK.every(c => c.length <= 30), "…all of them short");
ok(new Set(QUICK).size === QUICK.length, "…with no repeats");
ok(QUICK.includes("Nice!") && QUICK.includes("Love it ❤️") && QUICK.includes("HMU 😏") && QUICK.includes("Coffee sometime?"), "…including the ones asked for");
ok(QUICK.includes(quickComment()), "…and one picked at random is one of them");

// 🤝 Who you can pick to write her when you befriend someone off Picagram.
{
  const r = befriendChoices("qwen", ["qwen", "deepseek"]);
  same(r[0].id, "qwen", "your Settings brain is offered first");
  ok(r[0].mine === true, "…and marked as yours");
  ok(r.filter(c => c.mine).length === 1, "…only it is marked as yours");
  ok(r.some(c => c.id === "claude"), "Claude is always on offer");
  ok(!r.some(c => c.id === "kimi"), "…a brain that isn't set up is not");
  ok(r.every(c => !!c.label && !!c.cost), "…each one says what it is and roughly what it costs");
  same(befriendChoices("", []).map(c => c.id), ["claude"], "nothing set up → Claude alone");
  same(befriendChoices("claude", ["kimi"]).map(c => c.id), ["claude", "kimi"], "Claude picked: no second Claude in the list");
}

console.log(bad ? `${bad} failed` : "all good");
process.exitCode = bad ? 1 : 0;
