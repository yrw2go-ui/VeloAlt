// Run: node --experimental-strip-types tests/thanks.test.ts
import { photoBrief, PHOTO_ODDS, giftById, giftFace } from "../app/lib/gifts.ts";


let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 📸 Most thank-yous come with a picture, not all of them.
ok(PHOTO_ODDS > 0.5 && PHOTO_ODDS < 1, `a photo comes with it most times, not every time (${PHOTO_ODDS})`);

// 💵 Money: she's holding it.
const cash = photoBrief("$2,500", "money", null).brief;
ok(/fan of cash/.test(cash) && /\$2,500/.test(cash), `money gets held up: "${cash}"`);

// 👜 Something she'd wear is sometimes on her, sometimes held up — never both at once.
const on = (what: string, id: string) => photoBrief(what, "gift", giftById(id), 0.2);
const up = (what: string, id: string) => photoBrief(what, "gift", giftById(id), 0.8);
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
ok(photoBrief("team gear", "gift", giftById("team-gear")).wearing, "team gear is worn, so nothing else is described");
ok(!photoBrief("$500", "money", null).wearing, "cash is never worn");
ok(!photoBrief("a large iced latte", "gift", giftById("iced-latte")).wearing, "nor is a coffee");

// Something that's somehow not in the list still gives a sensible picture.
ok(/holding up the present/.test(photoBrief("a present", "gift", null).brief), "an unknown present still works");

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
