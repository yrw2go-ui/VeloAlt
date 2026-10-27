import { NextRequest } from "next/server";
import { sql } from "../../../lib/db";
import { validTwilio, twiml, say, sayAndListen, publicUrl } from "../../../lib/twilio";
import { ownerByPhone, ownerById } from "../../../lib/owner";
import { askVelo, aiReady, type Turn } from "../../../lib/brain";
import { scrub } from "../../../lib/secrets";

// 📞 Velo on the phone, one Twilio webhook per turn.
//   ?a=<action id> — a call Velo placed FOR the owner (an approved draft_call): she
//                    talks to whoever answers to get the goal done ("errand").
//   no ?a          — someone calling Velo's number: the owner (Velo Pro, verified
//                    phone) gets Velo like an in-app call; anyone else is told no.
// The conversation so far lives in velo_actions.transcript. ?s counts silences.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TURNS = 40;
const hangup = (t: string) => twiml(`${say(t)}<Hangup/>`);

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text());
  if (!validTwilio(req, params)) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const actionId = url.searchParams.get("a") || "";
  const silences = Number(url.searchParams.get("s") || 0);
  // 🔒 Spoken passwords or codes are hidden before they're saved or seen.
  const heard = scrub(String(params.get("SpeechResult") || "").trim().slice(0, 1000));
  const callSid = String(params.get("CallSid") || "");
  if (!aiReady()) return hangup("Sorry, Velo isn't available right now. Goodbye.");

  try {
    // Find (or, for a new inbound call, start) this call's record.
    let act: { id: string; user_id: string; kind: string; to_name: string | null; body: string; transcript: Turn[] } | undefined;
    if (actionId) {
      if (!UUID.test(actionId)) return hangup("Goodbye.");
      [act] = (await sql()`select id, user_id, kind, to_name, body, transcript from velo_actions where id = ${actionId} and kind = 'call' and status in ('calling', 'approved')`) as typeof act[];
      if (!act) return hangup("Sorry, wrong number. Goodbye.");
    } else {
      [act] = (await sql()`select id, user_id, kind, to_name, body, transcript from velo_actions where twilio_sid = ${callSid} and kind = 'inbound'`) as typeof act[];
      if (!act) {
        const owner = await ownerByPhone(String(params.get("From") || ""));
        if (!owner || !owner.pro) return hangup("Hi, this is Velo, a personal assistant. I can only take calls from the person I work for. Goodbye.");
        const hello = `Hey${owner.name ? ` ${owner.name.split(" ")[0]}` : ""}, it's Velo. What's up?`;
        await sql()`insert into velo_actions (user_id, kind, status, body, twilio_sid, transcript) values (${owner.userId}, 'inbound', 'calling', '', ${callSid}, ${JSON.stringify([{ role: "assistant", content: hello }])}::jsonb)`;
        const turn = publicUrl(req, `/api/twilio/voice`);
        return twiml(sayAndListen(hello, turn, `${turn}?s=1`));
      }
    }

    const owner = await ownerById(act.user_id);
    if (!owner) return hangup("Goodbye.");
    const errand = act.kind === "call";
    const turns: Turn[] = Array.isArray(act.transcript) ? act.transcript : [];
    const base = publicUrl(req, `/api/twilio/voice`) + (errand ? `?a=${act.id}` : "");
    const silenceUrl = (n: number) => `${base}${errand ? "&" : "?"}s=${n}`;

    if (!heard) {
      if (turns.length && silences >= 2) return hangup(errand ? "I'll let you go. Thanks, goodbye." : "I'll let you go. Talk soon!");
      if (turns.length && silences >= 1) return twiml(sayAndListen("Sorry, are you still there?", base, silenceUrl(silences + 1)));
    } else {
      turns.push({ role: "user", content: heard });
    }
    if (turns.length > MAX_TURNS) return hangup(errand ? "I need to wrap up here. Thank you so much, goodbye." : "I need to go for now — talk soon!");

    const r = await askVelo(owner, errand
      ? { mode: "errand", messages: turns, name: owner.name, goal: act.body, toName: act.to_name || "" }
      : { mode: "talk", messages: turns, timeZone: owner.timeZone, name: owner.name });
    const done = /\[\[END\]\]/.test(r.reply);
    const line = r.reply.replace(/\[\[END\]\]/g, "").trim();
    turns.push({ role: "assistant", content: line });
    await sql()`update velo_actions set transcript = ${JSON.stringify(turns)}::jsonb, updated_at = now() where id = ${act.id}`;
    return done ? twiml(`${say(line)}<Hangup/>`) : twiml(sayAndListen(line, base, silenceUrl(1)));
  } catch (e) {
    console.error("voice", e);
    return hangup("Sorry, I'm having trouble on my end. I'll try again later. Goodbye.");
  }
}
