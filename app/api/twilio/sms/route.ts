import { NextRequest, after } from "next/server";
import { sql } from "../../../lib/db";
import { validTwilio, twiml, sendSms, showPhone } from "../../../lib/twilio";
import { ownerByPhone, addChat } from "../../../lib/owner";
import { askVelo, aiReady, type Turn } from "../../../lib/brain";
import { runAction, type Draft } from "../../../lib/pro";
import { allow } from "../../../lib/rateLimit";
import { scrub } from "../../../lib/secrets";

// 💬 A text to Velo's number. From a Velo Pro member's verified phone, it's the
// same conversation as the app chat; "YES" / "NO" approves or cancels the
// latest draft. Texts from anyone else get no reply.
// Velo replies by a separate text (the AI can take longer than Twilio waits).
const YES = /^\s*(yes|y|yep|yeah|send( it)?|ok(ay)?|do it|go)\s*[.!]*\s*$/i;
const NO = /^\s*(no|n|nope|cancel|don'?t|stop it)\s*[.!]*\s*$/i;

const preview = (d: Draft) => d.kind === "text" ? `✉️ Text to ${d.to_name || showPhone(String(d.to_phone))}: "${d.body}"`
  : d.kind === "post" ? `📣 Post to ${d.to_name}: "${d.body}"`
  : d.kind === "cart" ? `🛒 Amazon cart:\n${d.body}\nReview & check out: ${d.result}`
  : `📞 Call ${d.to_name || showPhone(String(d.to_phone))} to: ${d.body}`;
const VERB: Record<string, string> = { text: "send", call: "call", post: "post" };

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text());
  if (!validTwilio(req, params)) return new Response("Forbidden", { status: 403 });
  const owner = await ownerByPhone(params.get("From") || "");
  // 🔒 A code or password texted to Velo is hidden before it's saved or seen.
  const text = scrub(String(params.get("Body") || "").trim().slice(0, 1600));
  if (!owner || !owner.pro || !text || !aiReady()) return twiml("");
  if (!allow(owner.userId)) return twiml(`<Message>That's a lot of messages — give me a minute.</Message>`);

  after(async () => {
    const reply = async (t: string) => { await addChat(owner.userId, "assistant", t); await sendSms(owner.phone, t); };
    try {
      await addChat(owner.userId, "user", text);
      // YES / NO: the latest draft from the last 30 minutes.
      if (YES.test(text) || NO.test(text)) {
        const [d] = await sql()`select id, kind, to_name, to_phone from velo_actions where user_id = ${owner.userId} and status = 'pending'
          and kind in ('text', 'call', 'post') and created_at > now() - interval '30 minutes' order by created_at desc limit 1`;
        if (d) {
          const who = String(d.to_name || showPhone(String(d.to_phone)));
          const kind = String(d.kind) as keyof typeof VERB;
          if (NO.test(text)) {
            await sql()`update velo_actions set status = 'cancelled', updated_at = now() where id = ${d.id}`;
            return reply(`Okay, cancelled — I won't ${kind === "text" ? "send that" : kind === "post" ? "post that" : "make that call"}.`);
          }
          const r = await runAction(req, owner, String(d.id));
          return reply(r.ok ? (kind === "text" ? `Sent to ${who}. ✅` : kind === "post" ? `Posted to ${who}. ✅` : `Calling ${who} now — I'll text you how it went. 📞`) : (r.error || "That didn't go through."));
        }
      }
      const rows = await sql()`select role, content from velo_messages where user_id = ${owner.userId} and character_id is null order by created_at desc, id desc limit 30`;
      const turns = (rows.reverse() as Turn[]);
      const r = await askVelo(owner, { mode: "sms", messages: turns, timeZone: owner.timeZone, name: owner.name });
      // A cart is just a link (nothing to approve); texts, calls and posts wait for YES.
      const waiting = r.drafts.filter(d => d.status === "pending");
      const drafts = r.drafts.length ? `\n\n${r.drafts.map(preview).join("\n")}${waiting.length ? `\nReply YES to ${VERB[waiting[waiting.length - 1].kind]}, NO to cancel.` : ""}` : "";
      await reply(r.reply + drafts);
    } catch (e) {
      console.error("sms", e);
      await sendSms(owner.phone, "Sorry — I couldn't get to that just now. Try again in a minute?").catch(() => {});
    }
  });
  return twiml("");
}
