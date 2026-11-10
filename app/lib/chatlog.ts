// 📞💬 On a call, the character (or Velo) has her text chat with them in mind: the most recent
// messages word for word (older ones live on in her memory notes). Peeks are never included.
import { sql } from "./db";
import { formatLocal } from "./localTime";

const MAX_MESSAGES = 80;
const MAX_CHARS = 16000;

export async function chatLogNote(userId: string, characterId: string | null, tz: string, who: string): Promise<string> {
  const rows = (await sql()`select role, content, created_at::text as at from velo_messages
    where user_id = ${userId} and character_id is not distinct from ${characterId} and not peek
    order by created_at desc, id desc limit ${MAX_MESSAGES}`).reverse();
  if (!rows.length) return "";
  const lines: string[] = [];
  let day = "";
  for (const r of rows) {
    const ms = Date.parse(String(r.at).replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
    const when = Number.isFinite(ms) ? formatLocal(ms, tz) : "";
    const d = when.split(" at ")[0];
    if (d && d !== day) { lines.push(`— ${d} —`); day = d; }
    const text = String(r.content).replace(/\s+/g, " ").trim().slice(0, 600);
    if (text) lines.push(`${r.role === "assistant" ? who : "Them"}${when ? ` (${when.split(" at ")[1]})` : ""}: ${text}`);
  }
  let log = lines.join("\n");
  if (log.length > MAX_CHARS) log = "…\n" + log.slice(log.length - MAX_CHARS).replace(/^[^\n]*\n/, "");
  return `YOUR TEXT CHAT WITH THEM (most recent messages, oldest first — older ones are in your memory notes). This call is the same relationship: you remember all of it, and can bring it up naturally.\n${log}`;
}
