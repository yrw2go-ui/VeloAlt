// Run: node --experimental-strip-types tests/thanks.test.ts
import { photoBrief, PHOTO_ODDS, giftById } from "../app/lib/gifts.ts";


let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

// 📸 Most thank-yous come with a picture, not all of them.
ok(PHOTO_ODDS > 0.5 && PHOTO_ODDS < 1, `a photo comes with it most times, not every time (${PHOTO_ODDS})`);

// 💵 Money: she's holding it.
const cash = photoBrief("$2,500", "money", null);
ok(/fan of cash/.test(cash) && /\$2,500/.test(cash), `money gets held up: "${cash}"`);

// 👜 Something she'd wear is worn; something she wouldn't is held.
const purse = photoBrief("Gucci GG Marmont purse", "gift", giftById("gucci-purse"));
ok(/wearing the Gucci/.test(purse), `a purse is worn: "${purse}"`);
const shoes = photoBrief("Nike Air Max 270s", "gift", giftById("nike-shoes"));
ok(/wearing the Nike/.test(shoes), "so are trainers");
const necklace = photoBrief("Tiffany & Co. heart pendant necklace", "gift", giftById("tiffany-necklace"));
ok(/wearing the Tiffany/.test(necklace), "so is a necklace");
const speaker = photoBrief("Bose SoundLink speaker", "gift", giftById("bose-speaker"));
ok(/holding up the Bose/.test(speaker), `a speaker is held instead: "${speaker}"`);
const flowers = photoBrief("Flowers a dozen roses, delivered", "gift", giftById("flowers"));
ok(/holding up the/.test(flowers), "and so are flowers");
ok(/showing it off to the camera/.test(purse), "either way she's showing them");

// Something that's somehow not in the list still gives a sensible picture.
ok(/holding up the present/.test(photoBrief("a present", "gift", null)), "an unknown present still works");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
