// Run: node --experimental-strip-types tests/thanks.test.ts
import { photoBrief, PHOTO_ODDS, giftById, giftFace, wearOdds } from "../app/lib/gifts.ts";


let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 📸 Most thank-yous come with a picture, not all of them.
ok(PHOTO_ODDS > 0.5 && PHOTO_ODDS < 1, `a photo comes with it most times, not every time (${PHOTO_ODDS})`);

// 💵 Money: she's holding it.
const cash = photoBrief("$2,500", "money", null).brief;
ok(/fan of cash/.test(cash) && /\$2,500/.test(cash), `money gets held up: "${cash}"`);

// 👜 Something she'd wear is sometimes on her, sometimes held up — never both at once.
const on = (what: string, id: string) => photoBrief(what, "gift", giftById(id), 1);
const up = (what: string, id: string) => photoBrief(what, "gift", giftById(id), 0);
const purse = on("Gucci GG Marmont purse", "gucci-purse");
ok(/wearing the Gucci/.test(purse.brief) && purse.wearing, `a purse can be worn: "${purse.brief}"`);
ok(/holding up the Gucci/.test(up("Gucci GG Marmont purse", "gucci-purse").brief), "…and other times held up to the camera");
ok(!up("Gucci GG Marmont purse", "gucci-purse").wearing, "held up means she isn't wearing it");
ok(on("Nike Air Max 270s", "nike-shoes").wearing, "so are trainers");
ok(on("Tiffany & Co. heart pendant necklace", "tiffany-necklace").wearing, "so is a necklace");
const speaker = photoBrief("Bose SoundLink speaker", "gift", giftById("bose-speaker"));
ok(/holding up the Bose/.test(speaker.brief) && !speaker.wearing, `a speaker is never worn: "${speaker.brief}"`);
const flowers = photoBrief("Flowers a dozen roses, delivered", "gift", giftById("flowers"));
ok(/holding up the/.test(flowers.brief) && !flowers.wearing, "and nor are flowers");
ok(/showing it off to the camera/.test(purse.brief) && /showing it off to the camera/.test(up("Gucci GG Marmont purse", "gucci-purse").brief), "either way she's showing them");
// 👟 The conflict this exists to stop: she can't be in the new boots AND her usual white sneakers.
ok(photoBrief("team gear", "gift", giftById("team-gear"), 1).wearing, "team gear can be worn, and then nothing else is described");
ok(!photoBrief("team gear", "gift", giftById("team-gear"), 0).wearing, "…or held up to the camera instead");
ok(/their OWN team/.test(photoBrief("team gear", "gift", giftById("team-gear"), 0).brief), "either way it's her own team");
ok(!photoBrief("$500", "money", null, 1).wearing, "cash is never worn, however close you are");
ok(!photoBrief("a large iced latte", "gift", giftById("iced-latte"), 1).wearing, "nor is a coffee");

// 👋 Who tries a present on for you: someone who knows you, and someone game enough.
const odds = (t: Record<string, number>, close: number) => wearOdds(t, close);
ok(odds({}, 95) > odds({}, 5), "someone close tries it on; someone new holds it up");
ok(odds({}, 5) < 0.3, "a stranger very rarely puts it on for a photo");
ok(odds({}, 95) > 0.6, "someone who's mad about you usually does");
ok(odds({ flirty: 9 }, 50) > odds({}, 50), "a flirt will try anything on");
ok(odds({ energetic: 9 }, 50) > odds({}, 50), "so will a livewire");
ok(odds({ coldness: 9 }, 50) < odds({}, 50), "someone cold would rather just show you");
ok(odds({ moody: 9 }, 50) < odds({}, 50), "and so would someone shy");
ok(odds({ coldness: 10, moody: 10 }, 0) >= 0.05 && odds({ flirty: 10, energetic: 10, humor: 10 }, 100) <= 0.9, "nobody is ever certain either way");

// Something that's somehow not in the list still gives a sensible picture.
ok(/holding up the present/.test(photoBrief("a present", "gift", null).brief), "an unknown present still works");

// 🖐️ Hands. A present she is HOLDING is photographed on her own phone, so one hand is on the thing
// and the other is on the phone. Said nothing, the picture grows a second pair of arms to manage
// both at once — which is exactly what it was doing.
const heldShot = photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse"), 0);
const wornShot = photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse"), 1);
ok(/ONE hand/.test(heldShot.hands), "holding it: one hand on the thing");
ok(/other arm[\s\S]*phone/.test(heldShot.hands), "…and the other arm is the one holding the phone");
ok(/two arms and two hands/.test(heldShot.hands), "…two arms and two hands in total, said out loud");
ok(/no third or fourth arm/.test(heldShot.hands), "…and no third or fourth arm");
ok(/both of her hands are free/.test(wornShot.hands), "wearing it: both hands free");
ok(/two arms and two hands/.test(wornShot.hands), "…still only two arms and two hands");
ok(heldShot.hands !== wornShot.hands, "the two cases say different things");

// Every kind of present says something about hands, not just the clothes.
for (const [label, shot] of [
  ["cash", photoBrief("$500", "money", null)],
  ["a coffee", photoBrief("a large iced latte", "gift", giftById("iced-latte"))],
  ["team gear worn", photoBrief("team gear", "gift", giftById("team-gear"), 1)],
  ["team gear held", photoBrief("team gear", "gift", giftById("team-gear"), 0)],
  ["one of yours", photoBrief("courtside tickets", "gift", { id: "mine:x", name: "courtside tickets", brand: "Bulls", kind: "mine", price: 900, emoji: "🛍️" })],
  ["a speaker", photoBrief("Bose SoundLink speaker", "gift", giftById("bose-speaker"))],
] as const) {
  ok(/two arms and two hands/.test(shot.hands), `${label}: the hands are accounted for`);
  ok(shot.wearing ? /both of her hands are free/.test(shot.hands) : /ONE hand/.test(shot.hands),
    `${label}: ${shot.wearing ? "wearing it leaves both hands free" : "holding it uses one hand"}`);
}
// Cash and food are always held, so they always get the one-hand rule.
ok(!photoBrief("$500", "money", null).wearing && /ONE hand/.test(photoBrief("$500", "money", null).hands), "cash is held in one hand, with the other on the phone");

// 😊 Her face is hers: her sliders decide it, and how close you are changes where she's looking.
const face = (t: Record<string, number>, close = 50, big = false) => giftFace(t, close, big);
ok(/barely smiling/.test(face({ coldness: 9 })), "someone cold gives you the smallest smile she's got");
ok(/mid-laugh/.test(face({ humor: 9 })), "someone daft is already laughing");
ok(/straight down the lens/.test(face({ flirty: 9 })), "someone flirty looks straight at the camera");
ok(/beaming/.test(face({ energetic: 9 })), "someone lively is beaming");
ok(/almost shy/.test(face({ moody: 9 })), "someone moody gives you something smaller");
ok(/warm, genuine smile/.test(face({})), "and most people just smile");
ok(face({ coldness: 9 }) !== face({ humor: 9 }), "two different people never get the same face");

ok(/as though it's them/.test(face({}, 85)), "someone who's mad about you looks at the lens like it's you");
ok(/a little shy about it/.test(face({}, 20)), "someone who barely knows you is politer about it");
ok(/Half looking/.test(face({}, 55)), "and in between, in between");
ok(/more than she expected/.test(face({}, 55, true)), "something big catches her off guard");
ok(!/more than she expected/.test(face({}, 55, false)), "…an everyday one doesn't");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
