// 🗣️ Typing "@" to name someone.
import { atFragment, putName } from "../app/lib/mention.ts";
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };

const at = (t: string) => atFragment(t, t.length);
ok(at("hey @")?.frag === "", "a bare @ opens the list");
ok(at("hey @mi")?.frag === "mi", "what you've typed after it narrows the list");
ok(at("@Mia")?.frag === "Mia", "@ at the very start works");
ok(at("hey @mi there") === null, "a space ends it");
ok(at("mail me at bob@example") === null, "an email address isn't a mention");
ok(at("hey") === null, "no @, no list");
ok(at("@" + "x".repeat(30)) === null, "something far too long isn't a name");
ok(atFragment("hey @mi there", 7)?.frag === "mi", "it follows the caret, not the end of the line");

// ✍️ Picking a name puts it in.
ok(putName("hey @mi", 4, 7, "Mia") === "hey Mia ", "the half-typed @name is swapped for the whole one");
ok(putName("hey @mi too", 4, 7, "Mia") === "hey Mia too", "…leaving the rest of the line as it was");
ok(putName("@", 0, 1, "Monica") === "Monica ", "a bare @ becomes the name");
