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

/** Same as brainFor, reached through one of their characters. */
export async function brainForCharacter(characterId: unknown): Promise<string[]> {
  if (!characterId) return ["claude"];
  const [c] = await sql()`select user_id from chat_characters where id = ${String(characterId)}`;
  return c ? brainFor(String(c.user_id)) : ["claude"];
}
