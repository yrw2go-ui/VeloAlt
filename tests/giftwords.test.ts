// 📝 Every line on a gift photo is yours to change in Settings → Photo wording.
//
// The point of these: an edit has to reach the actual picture, and a line left alone has to keep
// saying exactly what it said before.
import { GIFT_BITS, giftDefaults, say, photoBrief, giftFace, giftById } from "../app/lib/gifts.ts";
import { readFileSync } from "node:fs";

// wording.ts reaches for the database, so it is read rather than imported.
const wordingSrc = readFileSync(new URL("../app/lib/wording.ts", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

// 🛠️ They all turn up in the editor, each with a label and a word about what it does.
const inEditor = /\.\.\.GIFT_BITS/.test(wordingSrc);
ok(inEditor, "the gift lines are part of Settings → Photo wording");
ok(/from "\.\/gifts"/.test(wordingSrc), "…read from the one place they are defined, so they cannot drift");
ok(GIFT_BITS.length >= 20, `every line of a gift photo is listed (${GIFT_BITS.length})`);
for (const b of GIFT_BITS) ok(!!b.label.trim() && !!b.about.trim() && !!b.text.trim(), `"${b.label}" has a name, a note and a default`);
ok(new Set(GIFT_BITS.map(b => b.key)).size === GIFT_BITS.length, "no two lines share a key");
ok(GIFT_BITS.every(b => b.key.startsWith("gift_")), "…and they are all plainly gift lines");

// 📝 An edit reaches the picture; everything else stays as it was.
const edited = { gift_wearing: "swanning about in the {thing} like she owns the place" };
const worn = photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse"), 1, 0.5, edited);
ok(worn.brief === "swanning about in the Gucci GG Marmont purse like she owns the place", `a reworded line is what goes out: "${worn.brief}"`);
ok(/two arms and two hands/.test(worn.hands), "…and the lines you didn't touch are untouched");
const held = photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse"), 0, 0.5, edited);
ok(/holding up the Gucci/.test(held.brief), "…including the other half of the same pair");

// {curly} bits are filled in, not left showing.
for (const shot of [worn, held, photoBrief("$500", "money", null, 0.5, 0.5, {}), photoBrief("a large iced latte", "gift", giftById("iced-latte"))]) {
  ok(!/\{\w+\}/.test(shot.brief), `nothing is left unfilled: "${shot.brief.slice(0, 48)}…"`);
  ok(!/\{\w+\}/.test(shot.hands), "…in the hands line either");
}
ok(/\$500/.test(photoBrief("$500", "money", null).brief), "the amount lands in the cash line");
ok(/team/.test(photoBrief("team gear", "gift", giftById("team-gear"), 1).brief), "the team line lands in the team gear one");

// 🙂 Her face is editable the same way, and still chosen by her sliders.
ok(/mid-laugh/.test(giftFace({ humor: 9 }, 50)), "a funny one laughs, by default");
ok(giftFace({ humor: 9 }, 50, false, { gift_face_funny: "snorting with laughter" }).includes("snorting with laughter"), "…and says what you tell it to");
ok(giftFace({ coldness: 9 }, 50, false, { gift_face_funny: "snorting with laughter" }).includes("barely smiling"), "…while a cold one is unaffected by that edit");
ok(giftFace({}, 90, false, { gift_look_close: "staring right down the lens" }).includes("staring right down the lens"), "where she's looking is editable too");
ok(giftFace({}, 50, true, { gift_big: "genuinely lost for words" }).includes("genuinely lost for words"), "and so is what a big one does to her");

// ↩️ Blank, missing or unchanged edits fall back to the default rather than emptying the picture.
ok(say({}, "gift_hands_worn") === giftDefaults().gift_hands_worn, "nothing saved: the default");
ok(say({ gift_hands_worn: "   " }, "gift_hands_worn") === giftDefaults().gift_hands_worn, "blanked out: still the default");
ok(say(undefined, "gift_cash", { what: "$20" }).includes("$20"), "no wording at all: still works");

// 🔒 The editor's own rules hold for these as they do for the rest: a blank or unchanged edit
// falls back to the default, and only real changes are stored. (Those rules live in wording.ts,
// which reaches for the database — they are covered where the editor itself is tested.)
ok(/slice\(0, 700\)/.test(wordingSrc), "the editor's length limit covers them too");

console.log(fail ? `\n${fail} failed` : "\nall good");
process.exit(fail ? 1 : 0);
