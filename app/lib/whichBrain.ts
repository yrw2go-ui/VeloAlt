// 🧠 Which brain writes this person's words: the one they picked in Settings, and their
// backup after it only if they switched one on. Nothing else gets a say — no character
// override, no quiet Claude stand-in.
import { sql } from "./db";
import { brainOrder } from "./pickBrain";

/** Their Settings brain, then their backup if it's on. */
export async function brainFor(userId: string): Promise<string[]> {
  const [u] = await sql()`select chat_model, backup_brain from users where id = ${userId}`;
  return brainOrder(u?.chat_model, u?.backup_brain);
}

/** Their Settings brain on its own — no backup (for the one-at-a-time jobs that offer a retry). */
export async function pickedBrain(userId: string): Promise<string[]> {
  const [u] = await sql()`select chat_model from users where id = ${userId}`;
  return brainOrder(u?.chat_model, "");
}

/** Same as brainFor, reached through one of their characters. A character belongs to whoever
 *  owns her, or failing that whoever made her — a shared one has no owner. Never throws: a
 *  character we can't place falls back to the default rather than taking her words down with it. */
export async function brainForCharacter(characterId: unknown): Promise<string[]> {
  if (!characterId) return ["claude"];
  try {
    const [c] = await sql()`select owner_id, created_by from chat_characters where id = ${String(characterId)}`;
    const who = String(c?.owner_id || c?.created_by || "");
    return who ? brainFor(who) : ["claude"];
  } catch (e) {
    console.error("whichBrain: whose character is this?", e instanceof Error ? e.message : e);
    return ["claude"];
  }
}
