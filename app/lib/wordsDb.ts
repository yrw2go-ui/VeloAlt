// 🛠️ The one bit of Admin → Messaging & wording that touches the database. Kept apart from
// words.ts so the wording itself can be read (and tested) without a database.
import { sql } from "./db";
import { talkWords, type Words } from "./words";

export async function wordsFor(userId: string): Promise<Words> {
  const [row] = await sql()`select talk_words from users where id = ${userId}`;
  return talkWords(row);
}
