// 💑 The person a character is seeing or married to who isn't a character of their own.
// Their look is remembered the first time a picture of them is made, so the next one has the
// same face. Change who they're with — a different name, or it ends — and that look is thrown
// away: the new person gets a new face. Any character, man or woman.
import { sql } from "./db";
import { defaults as wordDefaults, type Words } from "./words";

export type Partner = { name: string; look: string; refs: string[] };
type Seeing = { attached?: string | null; partner?: string | null };

/** Who they're with right now, by the card: nobody unless they're dating or married AND have a name. */
export const seeing = (c: Seeing): string =>
  (c?.attached === "dating" || c?.attached === "married") ? String(c?.partner || "").trim() : "";

/** 💑 Their sweetheart's remembered look — and a clean slate whenever that person changes. */
export async function partnerLook(userId: string, characterId: string, c: Seeing): Promise<Partner | null> {
  const name = seeing(c);
  const [row] = await sql()`select name, look, refs from chat_partner_looks where user_id = ${userId} and character_id = ${characterId}`;
  if (!name) {
    // 💔 Single again: whatever they looked like goes with them.
    if (row) await sql()`delete from chat_partner_looks where user_id = ${userId} and character_id = ${characterId}`;
    return null;
  }
  if (row && String(row.name).trim().toLowerCase() !== name.toLowerCase()) {
    // 🔁 Someone new: the old references are no use, so they're dropped.
    await sql()`delete from chat_partner_looks where user_id = ${userId} and character_id = ${characterId}`;
    return { name, look: "", refs: [] };
  }
  return { name, look: row ? String(row.look || "") : "", refs: row ? (row.refs as string[]) || [] : [] };
}

/** 📸 The first picture of them sets their face; the next few back it up. Up to 3 kept. */
export async function rememberPartnerPic(userId: string, characterId: string, name: string, url: string, look: string): Promise<void> {
  const n = String(name || "").trim();
  if (!n || !url) return;
  // 👭 Only their sweetheart's face is kept this way — a picture of a friend changes nothing.
  const [c] = await sql()`select attached, partner from chat_characters where id = ${characterId}`;
  if (!c || seeing(c as Seeing).toLowerCase() !== n.toLowerCase()) return;
  await sql()`insert into chat_partner_looks (user_id, character_id, name, look, refs)
    values (${userId}, ${characterId}, ${n}, ${String(look || "").slice(0, 400)}, ${[url]})
    on conflict (user_id, character_id) do update set
      refs = case when lower(chat_partner_looks.name) = lower(${n})
        then (array(select distinct unnest(chat_partner_looks.refs || ${[url]}::text[])))[1:3] else ${[url]} end,
      look = case when chat_partner_looks.look = '' or lower(chat_partner_looks.name) <> lower(${n}) then ${String(look || "").slice(0, 400)} else chat_partner_looks.look end,
      name = ${n}`;
}

/** What they're told about sending a picture of them. 🛠️ Admin → 🏡 Her own life. */
export const partnerPicNote = (p: Partner, w?: Words): string => {
  const words = { ...wordDefaults(), ...(w || {}) };
  const fill = (t: string) => String(t || "").replace(/\{who\}/g, p.name).replace(/[ \t]{2,}/g, " ").trim();
  return [fill(words.sweetheart), fill(p.refs.length ? words.sweetheart_again : words.sweetheart_first)].filter(Boolean).join(" ");
};
