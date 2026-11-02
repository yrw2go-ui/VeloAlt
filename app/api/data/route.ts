import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { isValidTimeZone } from "../../lib/localTime";
import { VELO_LOOKS } from "../../lib/veloAvatars";
import { toE164, showPhone, twilioReady, veloNumber } from "../../lib/twilio";
import { PHONE_MSG } from "../../lib/contact";
import { scrub } from "../../lib/secrets";
import { availableModels, CHAT_MODELS, MODEL_INFO, type ChatModel } from "../../lib/models";
import { PERSONALITIES } from "../../lib/persona";

// 📦 Everything the app reads and changes, for the signed-in person only.
// POST { action, ...args } → { ... }. Every query is scoped to their user_id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const db = sql(), me = c.userId;
    const id = String(b.id || "");
    const needId = () => UUID.test(id);

    switch (String(b.action || "")) {
      case "profile.get": {
        const [u] = await db`select name, look, time_zone, plan, phone, phone_verified_at, chat_model, personality, adult_confirmed_at, spicy_voice, secret_voice, spicy_api_voice from users where id = ${me}`;
        const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${me} and kind = 'call'`;
        return NextResponse.json({
          name: u?.name || "", look: u?.look || "default", timeZone: u?.time_zone || null, hadCall: n > 0,
          plan: u?.plan || "free", proForSale: !!process.env.STRIPE_PRICE_PRO && twilioReady(),
          phone: u?.phone ? showPhone(String(u.phone)) : "", phoneVerified: !!u?.phone_verified_at, veloNumber: veloNumber(),
          chatModel: availableModels().includes(u?.chat_model) ? u?.chat_model : "claude",
          models: availableModels().map(id => ({ id, ...MODEL_INFO[id] })),
          personality: (u?.personality === "romantic" && !u?.adult_confirmed_at) || (u?.personality === "alternate" && c.email.toLowerCase() !== "yrw2go@gmail.com") ? "friend" : (u?.personality || "friend"),
          adultConfirmed: !!u?.adult_confirmed_at,
          isAdmin: c.email.toLowerCase() === "yrw2go@gmail.com",
          spicyVoice: u?.spicy_voice || "secretvoice",
          secretVoice: u?.secret_voice || "velvet",
          spicyApiVoice: u?.spicy_api_voice || "Bella Bright",
        });
      }
      
      case "profile.generateLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const provider = String(b.provider || "spicy");
        const prompt = String(b.prompt || "");
        if (provider === "atlas" && process.env.ATLASCLOUD_API_KEY) {
          const res = await fetch("https://api.atlascloud.ai/api/v1/model/generateImage", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "seedream-3.0", prompt }),
          });
          if (!res.ok) return bad("Atlas generation failed.");
          const data = await res.json();
          const predId = data?.data?.id;
          if (!predId) return bad("No prediction id.");
          // Poll a few times
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const poll = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${predId}`, {
              headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}` },
            });
            if (poll.ok) {
              const p = await poll.json();
              if (p?.data?.status === "completed" && p?.data?.outputs?.[0]) {
                return NextResponse.json({ url: p.data.outputs[0] });
              }
            }
          }
          return bad("Atlas timed out.");
        } else {
          const key = process.env.SPICY_API_KEY;
          if (!key) return bad("Not set up.");
          const res = await fetch("https://api.spicyapi.com/v1/images/generations", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "spicy-image-1", prompt, size: "832*1216", n: 1 }),
          });
          if (!res.ok) return bad("Generation failed.");
          const data = await res.json();
          return NextResponse.json({ url: data?.data?.[0]?.url || null });
        }
      }
      case "profile.saveLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const key = process.env.SPICY_API_KEY;
        if (!key) return bad("Not set up.");
        const res = await fetch("https://api.spicyapi.com/v1/characters", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Velo", image_urls: [String(b.imageUrl || "")] }),
        });
        if (!res.ok) return bad("Couldn't save.");
        const data = await res.json();
        // Store character id if desired
        return NextResponse.json({ ok: true, characterId: data.id });
      }

      case "profile.update": {
        if (typeof b.name === "string") await db`update users set name = ${clean(b.name, 80) || null}, updated_at = now() where id = ${me}`;
        if (typeof b.look === "string" && VELO_LOOKS.some(l => l.id === b.look)) await db`update users set look = ${b.look}, updated_at = now() where id = ${me}`;
        if (isValidTimeZone(b.timeZone)) await db`update users set time_zone = ${b.timeZone} where id = ${me}`;
        // Romantic is for adults: picking it needs the 18+ confirmation (sent with it, or given before).
        if (b.adultConfirmed === true) await db`update users set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = ${me}`;
        if (typeof b.spicyVoice === "string" && ["secretvoice","fish","spicy"].includes(b.spicyVoice)) {
          await db`update users set spicy_voice = ${b.spicyVoice}, updated_at = now() where id = ${me}`;
        }
        if (typeof b.secretVoice === "string" && ["velvet","whisper","angel","jade","honey","crystal","diamond","sunny","star","candy","bubbles"].includes(b.secretVoice)) {
          await db`update users set secret_voice = ${b.secretVoice}, updated_at = now() where id = ${me}`;
        }
        if (typeof b.spicyApiVoice === "string") {
          await db`update users set spicy_api_voice = ${b.spicyApiVoice}, updated_at = now() where id = ${me}`;
        }
        if (PERSONALITIES.includes(b.personality)) {
          const [a] = await db`select adult_confirmed_at from users where id = ${me}`;
          if (b.personality === "romantic" && !a?.adult_confirmed_at) return bad("Romantic mode is for adults — confirm you're 18 or older.");
          if (b.personality === "alternate" && c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Alternate personality is admin-only.");
          await db`update users set personality = ${b.personality}, updated_at = now() where id = ${me}`;
        }
        if (CHAT_MODELS.includes(b.chatModel) && availableModels().includes(b.chatModel as ChatModel)) await db`update users set chat_model = ${b.chatModel}, updated_at = now() where id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      case "messages.list": {
        const rows = await db`select role, content from velo_messages where user_id = ${me} order by created_at desc, id desc limit 60`;
        return NextResponse.json({ messages: rows.reverse() });
      }
      case "messages.add": {
        const list = (Array.isArray(b.messages) ? b.messages : []).slice(0, 4)
          .map((m: { role?: string; content?: unknown }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: scrub(String(m.content || "").slice(0, 8000)) }))
          .filter((m: { content: string }) => m.content);
        // A millisecond apart so they always sort in the order sent.
        const at = Date.now() - list.length;
        for (const [i, m] of list.entries()) await db`insert into velo_messages (user_id, role, content, created_at) values (${me}, ${m.role}, ${m.content}, ${new Date(at + i).toISOString()})`;
        return NextResponse.json({ ok: true });
      }
      case "messages.clear":
        await db`delete from velo_messages where user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "reminders.list": {
        const rows = await db`select id, text, remind_at, status from velo_reminders where user_id = ${me} and status in ('pending', 'sent') order by remind_at limit 50`;
        return NextResponse.json({ reminders: rows });
      }
      case "reminders.due": {
        // Claims due reminders (marks them sent) so each pops up once.
        const rows = await db`update velo_reminders set status = 'sent', sent_at = now()
          where user_id = ${me} and status = 'pending' and remind_at <= now() returning id, text`;
        return NextResponse.json({ due: rows });
      }
      case "reminders.dismiss":
        if (!needId()) return bad("Unknown reminder.");
        await db`update velo_reminders set status = 'dismissed' where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "tasks.list": {
        const rows = await db`select id, text, due_date::text as due_date, done from velo_tasks
          where user_id = ${me} and (done = false or done_at > now() - interval '1 day') order by created_at limit 100`;
        return NextResponse.json({ tasks: rows });
      }
      case "tasks.add": {
        const text = clean(b.text, 300);
        if (!text) return bad("Say what the to-do is.");
        await db`insert into velo_tasks (user_id, text) values (${me}, ${text})`;
        return NextResponse.json({ ok: true });
      }
      case "tasks.toggle":
        if (!needId()) return bad("Unknown to-do.");
        await db`update velo_tasks set done = ${!!b.done}, done_at = ${b.done ? new Date().toISOString() : null} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      case "tasks.delete":
        if (!needId()) return bad("Unknown to-do.");
        await db`delete from velo_tasks where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "memories.list": {
        const rows = await db`select id, kind, text, status, created_at from velo_memories where user_id = ${me} order by created_at desc limit 300`;
        return NextResponse.json({ memories: rows });
      }
      case "memories.delete":
        if (!needId()) return bad("Unknown memory.");
        await db`delete from velo_memories where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "contacts.list": {
        const rows = await db`select id, name, phone from velo_contacts where user_id = ${me} order by lower(name) limit 500`;
        return NextResponse.json({ contacts: rows.map(r => ({ id: r.id, name: r.name, phone: showPhone(String(r.phone)) })) });
      }
      case "contacts.add": {
        const name = clean(b.name, 80), phone = toE164(b.phone);
        if (!name) return bad("Add a name.");
        if (!phone) return bad(PHONE_MSG);
        await db`insert into velo_contacts (user_id, name, phone) values (${me}, ${name}, ${phone}) on conflict (user_id, lower(name)) do update set phone = excluded.phone`;
        return NextResponse.json({ ok: true });
      }
      case "contacts.delete":
        if (!needId()) return bad("Unknown contact.");
        await db`delete from velo_contacts where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "drafts.list": {
        // Recent texts and calls Velo drafted or made, for the chat's cards.
        const rows = await db`select id, kind, to_name, to_phone, body, status, result from velo_actions
          where user_id = ${me} and kind in ('text', 'call', 'post') and created_at > now() - interval '2 days' order by created_at limit 30`;
        return NextResponse.json({ drafts: rows });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("data", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
