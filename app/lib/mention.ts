// 🗣️ The "@…" being typed, and putting the name you picked in its place.

/** The "@…" at the caret, if there is one: "hey @mi|" → { at: 4, frag: "mi" }. */
export function atFragment(text: string, caret: number): { at: number; frag: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  const before = at === 0 ? "" : upto[at - 1];
  if (before && /[\p{L}\p{N}@]/u.test(before)) return null; // mid-word @ isn't a mention
  const frag = upto.slice(at + 1);
  if (/[\s@]/.test(frag) || frag.length > 24) return null;
  return { at, frag };
}

/** The text with the "@frag" at the caret swapped for someone's name. */
export const putName = (text: string, at: number, caret: number, name: string) =>
  `${text.slice(0, at)}${name}${text.slice(caret).startsWith(" ") ? "" : " "}${text.slice(caret)}`;
