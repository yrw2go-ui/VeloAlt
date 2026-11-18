// Run: node --experimental-strip-types tests/comments.test.ts
import { randomComments, FLIRTY } from "../app/lib/picaComments.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
// Over many goes, what do the commenters say about this picture?
const says = (text: string, kind: "image" | "text" = "image", n = 4) => {
  const out = new Set<string>();
  for (let i = 0; i < 300; i++) for (const c of randomComments(text, kind, n)) out.add(c.text);
  return [...out];
};

// 👗 They can see what she's wearing, and say so.
const beach = says("Standing on the beach at golden hour in a white crop top and denim shorts, laughing");
ok(beach.some(c => /crop top/i.test(c)), `they notice the crop top (e.g. "${beach.find(c => /crop top/i.test(c))}")`);
ok(beach.some(c => /shorts/i.test(c)), "…and the shorts");
ok(beach.some(c => /beach|sand|water/i.test(c)), `…and that she's at the beach (e.g. "${beach.find(c => /beach/i.test(c))}")`);
const gym = says("Mid-workout at the gym in a black sports bra and leggings, squatting with a barbell");
ok(gym.some(c => /sports bra/i.test(c)) && gym.some(c => /leggings/i.test(c)), "a gym shot: the sports bra and the leggings both get mentioned");
ok(gym.some(c => /gym|workout|gains|beast|leg day/i.test(c)), "…and what she's doing");
ok(!gym.some(c => /beach|crop top/i.test(c)), "…and nothing about a beach or a crop top that isn't there");
const dog = says("On the couch at home under a blanket with her golden retriever, in an oversized hoodie");
ok(dog.some(c => /hoodie/i.test(c)) && dog.some(c => /pet|baby|buddy|🐾|face/i.test(c)) && dog.some(c => /cozy|lazy|comfy|place|care/i.test(c)),
  "a cosy one at home: the hoodie, the dog and the cosiness all land");

// Every post still gets something about the picture, every time.
for (let i = 0; i < 200; i++) {
  const c = randomComments("At the pool in a red bikini, sunglasses on", "image", 3);
  if (!c.some(x => /bikini|sunglasses|pool|water|summer|swim|life|with you/i.test(x.text))) { ok(false, "a post without a single comment about the picture"); break; }
}
ok(true, "every post gets at least one comment about what's actually in it");

// A text post isn't given outfit comments.
const words = says("Some days you just need a long drive and a loud playlist", "text", 3);
ok(!words.some(c => /crop top|bikini|the hoodie|Love the /i.test(c)), "a text post gets no outfit comments");
ok(words.some(c => /felt|mood|same|real|true|facts|me\b/i.test(c)), "…it gets replies to what was said");

// Nothing recognisable: plain, friendly comments rather than nonsense.
const plain = randomComments("", "image", 3);
ok(plain.length === 3 && plain.every(c => c.text.length > 0 && c.name.length > 0), "a picture with no description still gets normal comments");
ok(new Set(says("At the beach in a crop top")).size > 40, "and they're never the same few lines over and over");

// 😘 Some of them shoot their shot.
const shot = new Set(FLIRTY);
const many = says("At the pool in a red bikini, sunglasses on");
ok(many.some(c => /can we go out|wanna get a coffee|you're hot/i.test(c)), `someone asks her out (e.g. "${many.find(c => /go out|coffee|hot!/i.test(c))}")`);

// Never more than one per post, and never instead of the comment about the picture.
let withFlirt = 0, tooMany = 0, lostPicture = 0;
for (let i = 0; i < 400; i++) {
  const c = randomComments("At the beach in a white crop top, laughing", "image", 4).map(x => x.text);
  const n = c.filter(x => shot.has(x)).length;
  if (n) withFlirt++;
  if (n > 1) tooMany++;
  if (shot.has(c[0])) lostPicture++;
}
ok(!tooMany, "never two pickup lines on the same post");
ok(!lostPicture, "…and never in place of the comment about the picture itself");
ok(withFlirt > 40 && withFlirt < 280, `it stays occasional, not every post (${withFlirt} of 400)`);

// 🙅 Not on the person's own posts.
const mine = new Set<string>();
for (let i = 0; i < 300; i++) for (const c of randomComments("At the beach in a white crop top, laughing", "image", 4, false)) mine.add(c.text);
ok(![...mine].some(c => /can we go out|you're hot!|wanna get a coffee|are you single|marry me|buy you a drink/i.test(c)),
  "nobody hits on the person on their own posts");

console.log(bad ? `\n${bad} failed` : "\nall good");
process.exit(bad ? 1 : 0);
