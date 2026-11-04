import { put, del } from "@vercel/blob";
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

    const storeRemote = async (remoteUrl: string, character = "Velo") => {
      let stored = remoteUrl;
      if (!remoteUrl.includes(".blob.vercel-storage.com")) {
        const imgRes = await fetch(remoteUrl);
        if (!imgRes.ok) throw new Error(`Couldn't download image (${imgRes.status}).`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 32) throw new Error("Image download was empty.");
        const type = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0];
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const uploaded = await put(`velo-looks/${me}/${Date.now()}.${ext}`, buf, { access: "public", contentType: type });
        if (!uploaded.url) throw new Error("Blob upload failed. Check BLOB_READ_WRITE_TOKEN.");
        stored = uploaded.url;
      }
      const name = String(character || "Velo").slice(0, 80);
      try { await db`insert into character_media (user_id, character_name, media_url, media_type) values (${me}, ${name}, ${stored}, 'image')`; } catch { /* gallery optional */ }
      try { await db`insert into velo_looks (user_id, name, image_url, is_active) values (${me}, ${name}, ${stored}, false)`; } catch { /* looks optional */ }
      return stored;
    };

    switch (String(b.action || "")) {
      
      case "profile.setMode": {
        const mode = String(b.mode || "productivity");
        if (!["spicy","productivity"].includes(mode)) return bad("Bad mode.");
        await db`update users set mode = ${mode} where id = ${me}`;
        return NextResponse.json({ ok: true });
      }
      case "profile.setNotify": {
        const side = String(b.side || "productivity");
        const on = Boolean(b.on);
        if (side === "spicy") await db`update users set notify_spicy = ${on} where id = ${me}`;
        else await db`update users set notify_productivity = ${on} where id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      case "profile.get": {
        const add = async (q: Promise<unknown>) => { try { await q; } catch { /* column already there */ } };
        await add(db`alter table users add column if not exists personality text default 'friend'`);
        await add(db`alter table users add column if not exists adult_confirmed_at timestamptz`);
        await add(db`alter table users add column if not exists spicy_voice text default 'secretvoice'`);
        await add(db`alter table users add column if not exists secret_voice text default 'velvet'`);
        await add(db`alter table users add column if not exists spicy_api_voice text default 'Bella Bright'`);
        await add(db`alter table users add column if not exists mode text default 'productivity'`);
        await add(db`alter table users add column if not exists notify_spicy boolean default false`);
        await add(db`alter table users add column if not exists notify_productivity boolean default true`);
        let u: Record<string, unknown> | undefined;
        try {
          const rows = await db`select name, look, time_zone, plan, phone, phone_verified_at, chat_model, personality, adult_confirmed_at, spicy_voice, secret_voice, spicy_api_voice, mode, notify_spicy, notify_productivity from users where id = ${me}`;
          u = rows[0] as Record<string, unknown> | undefined;
        } catch {
          const rows = await db`select name, look, time_zone, plan, phone, phone_verified_at, chat_model from users where id = ${me}`;
          u = rows[0] as Record<string, unknown> | undefined;
        }
        const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${me} and kind = 'call'`;
        const personality = String(u?.personality || "friend");
        const adult = !!u?.adult_confirmed_at;
        return NextResponse.json({
          name: u?.name || "", look: u?.look || "default", timeZone: u?.time_zone || null, hadCall: n > 0,
          plan: u?.plan || "free", proForSale: !!process.env.STRIPE_PRICE_PRO && twilioReady(),
          phone: u?.phone ? showPhone(String(u.phone)) : "", phoneVerified: !!u?.phone_verified_at, veloNumber: veloNumber(),
          chatModel: availableModels().includes(u?.chat_model as ChatModel) ? u?.chat_model : "claude",
          models: availableModels().map(id => ({ id, ...MODEL_INFO[id] })),
          personality: (personality === "romantic" && !adult) || (personality === "alternate" && c.email.toLowerCase() !== "yrw2go@gmail.com") ? "friend" : personality,
          adultConfirmed: adult,
          mode: u?.mode || "productivity",
          notifySpicy: !!u?.notify_spicy,
          notifyProductivity: u?.notify_productivity !== false,
          isAdmin: c.email.toLowerCase() === "yrw2go@gmail.com",
          spicyVoice: u?.spicy_voice || "secretvoice",
          secretVoice: u?.secret_voice || "velvet",
          spicyApiVoice: u?.spicy_api_voice || "Bella Bright",
        });
      }
      
      
      case "profile.listLooks": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const looks = await db`select id, name, image_url, is_active from velo_looks where user_id = ${me} order by created_at desc`;
        return NextResponse.json({ looks });
      }
      case "profile.saveLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = String(b.name || "Velo");
        const imageUrl = String(b.imageUrl || "");
        if (!imageUrl) return bad("No image.");
        // Download and re-upload to Vercel Blob for permanence
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) return bad("Couldn't download image.");
        const blob = await imgRes.blob();
        const uploaded = await put(`velo-looks/${me}/${Date.now()}.jpg`, blob, { access: "public" });
        if (!uploaded.url) return bad("Blob upload failed. Check token.");
        await db`update velo_looks set is_active = false where user_id = ${me}`;
        await db`insert into velo_looks (user_id, name, image_url, is_active) values (${me}, ${name}, ${uploaded.url}, true)`;
        await db`insert into character_media (user_id, character_name, media_url, media_type) values (${me}, ${name}, ${uploaded.url}, 'image')`;
        return NextResponse.json({ ok: true, url: uploaded.url });
      }
      case "profile.setActiveLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const id = String(b.id || "");
        await db`update velo_looks set is_active = false where user_id = ${me}`;
        await db`update velo_looks set is_active = true where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      
      case "profile.uploadLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = String(b.name || "Velo");
        const imageData = String(b.imageData || "");
        if (!imageData) return bad("No image.");
        // imageData is a data URL or base64
        const buf = Buffer.from(imageData.split(",")[1] || imageData, "base64");
        const blob = new Blob([buf], { type: "image/jpeg" });
        const uploaded = await put(`velo-looks/${me}/${Date.now()}.jpg`, blob, { access: "public" });
        if (!uploaded.url) return bad("Blob upload failed. Check token.");
        await db`update velo_looks set is_active = false where user_id = ${me}`;
        await db`insert into velo_looks (user_id, name, image_url, is_active) values (${me}, ${name}, ${uploaded.url}, true)`;
        await db`insert into character_media (user_id, character_name, media_url, media_type) values (${me}, ${name}, ${uploaded.url}, 'image')`;
        return NextResponse.json({ ok: true, url: uploaded.url });
      }

      
      
      case "profile.listCharacters": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        try { await db`create table if not exists velo_characters (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, created_at timestamptz default now(), unique(user_id, name))`; } catch { /* optional */ }
        const chars = await db`select distinct character_name as name from character_media where user_id = ${me}`;
        const extra = await db`select name from velo_characters where user_id = ${me}`.catch(() => [] as { name: string }[]);
        const names = [...new Set([...(chars || []).map(c => String(c.character_name || c.name)), ...(extra || []).map(c => String(c.name))])].filter(Boolean).sort();
        if (!names.includes("Velo")) names.unshift("Velo");
        return NextResponse.json({ characters: names });
      }
      case "profile.createCharacter": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = clean(b.name, 80);
        if (!name) return bad("Name required.");
        try { await db`create table if not exists velo_characters (id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, created_at timestamptz default now(), unique(user_id, name))`; } catch { /* optional */ }
        try { await db`insert into velo_characters (user_id, name) values (${me}, ${name}) on conflict (user_id, name) do nothing`; } catch { /* optional */ }
        return NextResponse.json({ ok: true, name });
      }
      case "profile.deleteCharacter": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = String(b.name || "");
        if (!name) return bad("Name required.");
        const rows = await db`select media_url from character_media where user_id = ${me} and character_name = ${name}`;
        for (const r of rows) {
          const url = String(r.media_url || "");
          if (url.includes(".blob.vercel-storage.com")) { try { await del(url); } catch { /* gone */ } }
        }
        await db`delete from character_media where user_id = ${me} and character_name = ${name}`;
        try { await db`delete from velo_characters where user_id = ${me} and name = ${name}`; } catch { /* optional */ }
        try { await db`delete from velo_looks where user_id = ${me} and name = ${name}`; } catch { /* optional */ }
        return NextResponse.json({ ok: true });
      }
      case "profile.renameCharacter": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const from = String(b.from || "");
        const to = String(b.to || "");
        if (!from || !to) return bad("Names required.");
        await db`update character_media set character_name = ${to} where user_id = ${me} and character_name = ${from}`;
        try { await db`update velo_characters set name = ${to} where user_id = ${me} and name = ${from}`; } catch { /* optional */ }
        try { await db`update velo_looks set name = ${to} where user_id = ${me} and name = ${from}`; } catch { /* optional */ }
        return NextResponse.json({ ok: true });
      }
      case "profile.deleteMedia": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const id = String(b.id || "");
        const rows = await db`select media_url from character_media where id = ${id} and user_id = ${me}`;
        const url = String(rows[0]?.media_url || "");
        await db`delete from character_media where id = ${id} and user_id = ${me}`;
        if (url) {
          try { await db`delete from velo_looks where user_id = ${me} and image_url = ${url}`; } catch { /* optional */ }
          if (url.includes(".blob.vercel-storage.com")) {
            try { await del(url); } catch { /* blob already gone */ }
          }
        }
        return NextResponse.json({ ok: true });
      }

      case "profile.listMedia": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = String(b.character || "Velo");
        const media = await db`select id, media_url, media_type, is_reference from character_media where user_id = ${me} and character_name = ${name} order by created_at desc`;
        return NextResponse.json({ media });
      }
      case "profile.setReference": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const id = String(b.id || "");
        const on = Boolean(b.on);
        await db`update character_media set is_reference = ${on} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      }
      case "profile.saveMedia": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const name = String(b.character || "Velo");
        const url = String(b.url || "");
        const type = String(b.type || "image");
        if (!url) return bad("No media.");
        // Download and re-upload to Blob for permanence
        const imgRes = await fetch(url);
        if (!imgRes.ok) return bad("Couldn't download image. Check Blob token.");
        const blob = await imgRes.blob();
        const uploaded = await put(`velo-looks/${me}/${Date.now()}.jpg`, blob, { access: "public" });
        await db`insert into character_media (user_id, character_name, media_url, media_type) values (${me}, ${name}, ${uploaded.url}, ${type})`;
        return NextResponse.json({ ok: true, url: uploaded.url });
      }

      case "profile.generateLook": {
        if (c.email.toLowerCase() !== "yrw2go@gmail.com") return bad("Admin only.");
        const provider = String(b.provider || "spicy");
        const prompt = String(b.prompt || "");
        const refs = Array.isArray(b.images) ? b.images.map(String).filter(u => u.startsWith("http")).slice(0, 2) : [];
        if (provider === "atlas" && process.env.ATLASCLOUD_API_KEY) {
          const body = refs.length
            ? { model: "bytedance/seedream-v5.0-pro/edit", prompt, images: refs, size: "1536*1536" }
            : { model: "bytedance/seedream-v5.0-pro/text-to-image", prompt, size: "1536*1536" };
          const res = await fetch("https://api.atlascloud.ai/api/v1/model/generateImage", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.text().catch(() => "");
            return bad(`Atlas failed: ${res.status} ${err.slice(0, 200)}`);
          }
          const data = await res.json();
          const predId = data?.data?.id;
          if (!predId) return bad("No prediction id.");
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const poll = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${predId}`, {
              headers: { Authorization: `Bearer ${process.env.ATLASCLOUD_API_KEY}` },
            });
            if (poll.ok) {
              const p = await poll.json();
              if (p?.data?.status === "completed" && p?.data?.outputs?.[0]) {
                const url = await storeRemote(String(p.data.outputs[0]), String(b.character || "Velo"));
                return NextResponse.json({ url });
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
          const raw = data?.data?.[0]?.url;
          if (!raw) return NextResponse.json({ url: null });
          return NextResponse.json({ url: await storeRemote(String(raw), String(b.character || "Velo")) });
        }
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
