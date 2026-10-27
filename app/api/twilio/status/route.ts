import { NextRequest, after } from "next/server";
import { sql } from "../../../lib/db";
import { validTwilio, sendSms, showPhone } from "../../../lib/twilio";
import { ownerById, addChat } from "../../../lib/owner";
import { askVelo, aiReady, type Turn } from "../../../lib/brain";

// 📞 A call ended. For a call Velo made for the owner (?a=): write a short
// report, put it in their chat, and text it to them. For a call to Velo: save
// what mattered to her memory, like after an in-app call.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_ANSWER: Record<string, string> = { "no-answer": "nobody answered", busy: "the line was busy", failed: "the call didn't connect", canceled: "the call was canceled" };

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text());
  if (!validTwilio(req, params)) return new Response("Forbidden", { status: 403 });
  const id = new URL(req.url).searchParams.get("a") || "";
  const callSid = String(params.get("CallSid") || "");
  const status = String(params.get("CallStatus") || "");
  const [act] = UUID.test(id)
    ? await sql()`update velo_actions set status = 'done', updated_at = now() where id = ${id} and kind = 'call' and status in ('calling', 'approved') returning id, user_id, kind, to_name, to_phone, transcript`
    : await sql()`update velo_actions set status = 'done', updated_at = now() where twilio_sid = ${callSid} and kind = 'inbound' and status = 'calling' returning id, user_id, kind, to_name, to_phone, transcript`;
  if (!act) return new Response("", { status: 204 });

  after(async () => {
    try {
      const owner = await ownerById(String(act.user_id));
      if (!owner) return;
      const turns = (Array.isArray(act.transcript) ? act.transcript : []) as Turn[];
      if (act.kind === "inbound") {
        if (aiReady() && turns.some(t => t.role === "user")) await askVelo(owner, { mode: "remember", messages: turns, timeZone: owner.timeZone, name: owner.name });
        return;
      }
      const who = String(act.to_name || showPhone(String(act.to_phone)));
      const report = !turns.some(t => t.role === "user")
        ? `📞 Call to ${who}: ${NO_ANSWER[status] || "nobody picked up"}. Want me to try again later?`
        : aiReady() ? (await askVelo(owner, { mode: "errandsum", messages: turns, name: owner.name, toName: who })).reply : `📞 Call to ${who} finished.`;
      await sql()`update velo_actions set result = ${report.slice(0, 2000)} where id = ${act.id}`;
      await addChat(owner.userId, "assistant", report);
      if (owner.phone && owner.pro) await sendSms(owner.phone, report);
    } catch (e) { console.error("call status", e); }
  });
  return new Response("", { status: 204 });
}
