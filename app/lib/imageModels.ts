// 🖼️ The Seedreams that write the pictures (Settings → Pictures). Each family has one model for
// a picture from words and another for a picture built on reference photos, and they don't all name
// the reference field the same thing — 5.5 calls it "reference_images", the others "images".
// Every id here is one Atlas Cloud documents; none is guessed. ATLASCLOUD_IMAGE_MODELS (JSON) can
// add or correct entries without a deploy, and Settings lets you add one by hand too.
export type ImageModel = { id: string; label: string; t2i: string; edit: string; refs?: "images" | "reference_images"; about?: string };
export const IMAGE_MODELS: ImageModel[] = [
  { id: "seedream-5.0-pro", label: "Seedream 5.0 Pro", t2i: "bytedance/seedream-v5.0-pro/text-to-image", edit: "bytedance/seedream-v5.0-pro/edit", refs: "images", about: "The default — the best likeness." },
  { id: "seedream-5.5", label: "Seedream 5.5", t2i: "bytedance/seedream-v5.5/text-to-image", edit: "bytedance/seedream-v5.5/edit", refs: "reference_images", about: "Newer: sharper text in a picture, and steadier over many edits." },
  { id: "seedream-5.0-lite", label: "Seedream 5.0 Lite", t2i: "bytedance/seedream-v5.0-lite", edit: "bytedance/seedream-v5.0-lite/edit", refs: "images", about: "Lighter and cheaper, and it keeps faces and colour well." },
];
export const DEFAULT_IMAGE_MODEL = "seedream-5.0-pro";
/** The built-in list, with any ATLASCLOUD_IMAGE_MODELS corrections folded in. */
export function imageModels(): ImageModel[] {
  let over: Record<string, Partial<ImageModel>> = {};
  try { over = JSON.parse(process.env.ATLASCLOUD_IMAGE_MODELS || "{}"); } catch { /* ignore */ }
  const list = IMAGE_MODELS.map(m => ({ ...m, ...(over[m.id] || {}) }));
  // Anything in the environment that isn't one of the built-ins is an extra choice.
  for (const [id, m] of Object.entries(over)) {
    if (!list.some(x => x.id === id) && m.t2i && m.edit) list.push({ id, label: m.label || id, t2i: m.t2i, edit: m.edit, refs: m.refs, about: m.about });
  }
  return list;
}
/** 🖼️ Which model writes this picture: their pick (or one they added), else the default.
 *  The old ATLASCLOUD_IMAGE_MODEL / _EDIT_MODEL still win for the default family, as before. */
export function imageModelFor(pick: unknown, mine: unknown, forEdit: boolean): { model: string; refs: "images" | "reference_images"; known: boolean } {
  const added = Array.isArray(mine) ? (mine as ImageModel[]).filter(m => m && m.id && m.t2i && m.edit) : [];
  const all = [...imageModels(), ...added];
  const want = String(pick || "") || DEFAULT_IMAGE_MODEL;
  const m = all.find(x => x.id === want) || all.find(x => x.id === DEFAULT_IMAGE_MODEL) || IMAGE_MODELS[0];
  const isDefault = m.id === DEFAULT_IMAGE_MODEL;
  const model = forEdit
    ? (isDefault && process.env.ATLASCLOUD_IMAGE_EDIT_MODEL) || m.edit
    : (isDefault && process.env.ATLASCLOUD_IMAGE_MODEL) || m.t2i;
  return { model, refs: m.refs || "images", known: !!m.refs };
}
/** 📎 Which field a model wants its reference photos in, from its id alone — so a picture that
 *  starts later (an offer they accept) gets it right too. A model we don't recognise starts with
 *  the commoner name, and atlasStart tries the other one if it's refused. */
export function refsShape(model: string): { refs: "images" | "reference_images"; known: boolean } {
  const known = [...IMAGE_MODELS, ...imageModels()].find(m => m.t2i === model || m.edit === model);
  if (known?.refs) return { refs: known.refs, known: true };
  return { refs: "images", known: false };
}
