// ⏰ Delivers the texts characters promised ("text me at 8") when their time comes.
import { sql } from "./db";
import { isValidTimeZone } from "./localTime";
import { askVelo } from "./brain";
import { getCharacter } from "./characters";
import { sendPush } from "./push";

/** ⏰ Sends every promised text whose time has come (run every minute). */
export async function deliverPromises(): Promise<number> {
  const due = await sql()`update chat_promises set status = 'sending' where id in (
      select id from chat_promises where status = 'pending' and due_at <= now() order by due_at limit 20)
    returning id, user_id, character_id, about`;
  let sent = 0;
  for (const p of due) {
    try {
      const [u] = await sql()`select email, name, time_zone from users where id = ${p.user_id}`;
      const character = await getCharacter(String(p.character_id));
      if (!u || !character) { await sql()`update chat_promises set status = 'cancelled' where id = ${p.id}`; continue; }
      const tz = isValidTimeZone(u.time_zone) ? u.time_zone : "America/Chicago";
      const history = (await sql()`select role, content from velo_messages where user_id = ${p.user_id} and character_id = ${p.character_id} and not peek
        order by created_at desc limit 20`).reverse().map(r => ({ role: r.role === "assistant" ? "assistant" as const : "user" as const, content: String(r.content) }));
      const r = await askVelo({ userId: String(p.user_id), email: String(u.email) }, { mode: "checkin", messages: history, timeZone: tz, name: u.name || "", character, promise: String(p.about) });
      const text = r.reply.replace(/\s+/g, " ").trim().slice(0, 500);
      if (!text || /lost my train of thought/i.test(text)) throw new Error("no text");
      await sql()`insert into velo_messages (user_id, role, content, character_id) values (${p.user_id}, 'assistant', ${text}, ${p.character_id})`;
      await sql()`update chat_promises set status = 'sent', sent_at = now() where id = ${p.id}`;
      await sendPush(String(p.user_id), { title: character.name, body: text.slice(0, 180), url: `/?chat=${p.character_id}`, icon: character.portrait_url || "/icon-192.png", tag: `chat-${p.character_id}` }).catch(() => 0);
      sent++;
    } catch (e) {
      console.error("promises:", e instanceof Error ? e.message : e);
      await sql()`update chat_promises set status = 'failed' where id = ${p.id}`;
    }
  }
  return sent;
}
