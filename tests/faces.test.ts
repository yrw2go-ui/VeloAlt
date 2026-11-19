// The first photo of a new face has to be one the picture service will accept.
// A caption that copies "no lingerie" into the description is refused, which used to
// drop the whole person and leave the button looking like it did nothing.
import { plainFacePhoto } from "../app/lib/facePhoto.ts";

const NEVER = /\b(nude|nudity|naked|nsfw|sex|sexual|porn\w*|erotic|explicit|topless|bottomless|nipples?|genitals?|strip(ping|tease)?|undress(ed|ing)?|fetish|onlyfans|lingerie|underwear|thong|see-?through|xxx)\b/i;
const SUGGESTIVE = /\b(sexy|seductive|sultry|bikini|swimsuit|cleavage|lingerie|bedroom|in bed|flirty|kiss(ing)?)\b/i;

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

const echoed = "Maya at brunch, fully clothed, no lingerie, natural light";
ok(NEVER.test(echoed), "a description that only mentions lingerie to forbid it is still refused");
const plain = plainFacePhoto("Maya");
ok(!NEVER.test(plain) && !SUGGESTIVE.test(plain), "the plain retry is a photo the service will start");
ok(plain.startsWith("Maya "), "the plain photo is of her");

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
