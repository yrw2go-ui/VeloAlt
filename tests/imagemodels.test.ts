// 🖼️ Which Seedream writes the pictures, and which field its reference photos go in.
// Every id checked here is one Atlas Cloud documents — none is guessed.
import { IMAGE_MODELS, imageModels, imageModelFor, refsShape, DEFAULT_IMAGE_MODEL } from "../app/lib/imageModels.ts";

let bad = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) bad++; };
const is = (a: unknown, b: unknown, m: string) => ok(a === b, `${m} — got ${JSON.stringify(a)}`);

// The three families, with the ids Atlas documents (note Lite's plain one for a picture from words).
is(IMAGE_MODELS.length, 3, "three built-in families");
is(DEFAULT_IMAGE_MODEL, "seedream-5.0-pro", "the default is what was already running");
is(imageModelFor("", null, false).model, "bytedance/seedream-v5.0-pro/text-to-image", "nothing picked → the old default, from words");
is(imageModelFor("", null, true).model, "bytedance/seedream-v5.0-pro/edit", "…and its edit model for reference photos");
is(imageModelFor("seedream-5.5", null, false).model, "bytedance/seedream-v5.5/text-to-image", "5.5 from words");
is(imageModelFor("seedream-5.5", null, true).model, "bytedance/seedream-v5.5/edit", "5.5 from reference photos");
is(imageModelFor("seedream-5.0-lite", null, false).model, "bytedance/seedream-v5.0-lite", "Lite from words has no task on the end");
is(imageModelFor("seedream-5.0-lite", null, true).model, "bytedance/seedream-v5.0-lite/edit", "Lite from reference photos does");

// 5.5 wants its reference photos under a different name from the others.
is(refsShape("bytedance/seedream-v5.5/edit").refs, "reference_images", "5.5 takes reference_images");
is(refsShape("bytedance/seedream-v5.0-pro/edit").refs, "images", "5.0 Pro takes images");
is(refsShape("bytedance/seedream-v5.0-lite/edit").refs, "images", "Lite takes images");
ok(refsShape("bytedance/seedream-v5.5/edit").known && refsShape("bytedance/seedream-v5.0-pro/edit").known, "…and we know that for sure about both");
is(refsShape("someone/brand-new/edit").known, false, "a model added by hand: the shape isn't known");
is(refsShape("someone/brand-new/edit").refs, "images", "…so it starts with the commoner name (and the other is tried if refused)");

// One you added yourself, and switching back.
const mine = [{ id: "mine-x", label: "Seedream 6", t2i: "bytedance/seedream-v6/text-to-image", edit: "bytedance/seedream-v6/edit" }];
is(imageModelFor("mine-x", mine, false).model, "bytedance/seedream-v6/text-to-image", "one you added is used when picked");
is(imageModelFor("mine-x", mine, true).model, "bytedance/seedream-v6/edit", "…for reference photos too");
is(imageModelFor("seedream-5.0-pro", mine, false).model, "bytedance/seedream-v5.0-pro/text-to-image", "switching back to the default works");
is(imageModelFor("gone-away", mine, false).model, "bytedance/seedream-v5.0-pro/text-to-image", "a model that is no longer there falls back to the default, not to nothing");
is(imageModelFor("mine-x", null, false).model, "bytedance/seedream-v5.0-pro/text-to-image", "…and one of yours is only yours");

// Nothing here is empty, and nothing is a half-written id.
ok(imageModels().every(m => m.label && /^[a-z0-9._-]+\/[a-z0-9._-]+(\/[a-z0-9._-]+)?$/i.test(m.t2i) && /^[a-z0-9._-]+\/[a-z0-9._-]+(\/[a-z0-9._-]+)?$/i.test(m.edit)),
  "every built-in has a name and two well-formed ids");


// 💵 Roughly what a picture costs, shown beside the name. A model with no figure shows
// nothing rather than a number that might be wrong.
for (const m of imageModels()) ok(m.price === undefined || typeof m.price === "string", `${m.label}: a price is a string or absent`);
ok(imageModels().every(m => !m.price || /[¢$]|cent|penny/i.test(m.price)), "any price that is set reads as money");

// The three figures Atlas Cloud charges, as they read on the card.
is(imageModels().find(m => m.id === "seedream-5.0-pro")?.price, "~3.2¢", "5.0 Pro costs $0.0315");
is(imageModels().find(m => m.id === "seedream-5.5")?.price, "~3.5¢", "5.5 costs $0.035");
is(imageModels().find(m => m.id === "seedream-5.0-lite")?.price, "~1.2¢", "Lite costs $0.012");
ok(imageModels().every(m => !!m.price), "every built-in now says what it costs");

console.log(bad ? `${bad} failed` : "all good");
process.exitCode = bad ? 1 : 0;
