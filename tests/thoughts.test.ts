// 💭 Thoughts she writes in brackets are never shown.
import { cleanReply, dropThoughts } from "../app/lib/text.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };

ok(dropThoughts("[She wonders if he means it] Hey you 🙂") === "Hey you 🙂", "a thought in front of her words goes");
ok(dropThoughts("Hey you 🙂 [play it cool]") === "Hey you 🙂", "…and one after them");
ok(dropThoughts("Sunday it is.\n[I can't believe he asked]\nPick somewhere nice x") === "Sunday it is.\n\nPick somewhere nice x", "…and one on its own line");
ok(dropThoughts("[I should play this cool]") === "", "a message that's nothing but a thought leaves nothing");
ok(cleanReply("[thinking: he's sweet] glad you liked it 😏") === "glad you liked it 😏", "cleaning a reply drops them too");
ok(dropThoughts("I read that book you mentioned") === "I read that book you mentioned", "ordinary words are left alone");
ok(dropThoughts("*I nudge your arm* come on then") === "*I nudge your arm* come on then", "actions in asterisks still work");
ok(dropThoughts("meet me at [the place we went]") === "meet me at", "brackets mid-sentence go as well");
ok(dropThoughts("a [ b") === "a [ b", "an unclosed bracket isn't a thought");

console.log(bad ? `${bad} failed` : "all good");
process.exit(bad ? 1 : 0);
