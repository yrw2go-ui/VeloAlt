// ⭐ Velo Pro tools: contacts, drafts of texts and calls Velo makes for them
// from her own number, and drafts of posts to their Facebook Page. Velo only ever DRAFTS: nothing is sent or dialed
// until the person approves it (Send in the app, or YES by text) — see
// app/api/actions and runAction below.
import type Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import type { Caller } from "./caller";
import { sql } from "./db";
import { toE164, showPhone, sendSms, startCall, publicUrl } from "./twilio";
import { connectedPage, connectedPageName, publish, fbErrorMessage } from "./facebook";
import { scrub } from "./secrets";

export const PRO_TOOL_NAMES = ["save_contact", "list_contacts", "draft_text", "draft_call", "draft_post", "amazon_cart"] as const;
export const isProTool = (name: string) => (PRO_TOOL_NAMES as readonly string[]).includes(name);
export class ProError extends Error {}
const clean = (v: unknown, n: number) => scrub(String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n));
/** Per person per day. */
export const DAILY = { text: 30, call: 10, post: 10 };
type Kind = keyof typeof DAILY;

export const PRO_TOOLS: Anthropic.Tool[] = [
  {
    name: "save_contact",
    description: "Save (or update) a contact's phone number so you can text or call them later. US/Canada numbers only.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "How they refer to them, e.g. \"Mom\" or \"Dr. Patel's office\"" }, phone: { type: "string", description: "10-digit number" } },
      required: ["name", "phone"],
      additionalProperties: false,
    },
  },
  {
    name: "list_contacts",
    description: "Their saved contacts with numbers.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "draft_text",
    description: "Draft a text message to send FROM YOUR (Velo's) NUMBER to someone for them. It is NOT sent until they approve it: the app shows the draft with a Send button. Write the message in a natural voice as if from them; the app adds who it's from automatically. Never say it's been sent.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "A saved contact's name, or a 10-digit number" },
        message: { type: "string", description: "The text to send (keep it short)" },
      },
      required: ["to", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "amazon_cart",
    description: "Put together an Amazon cart for them: the app shows the items with an \"Open Amazon cart\" button that adds them to THEIR Amazon cart, where they review and check out themselves. Nothing is bought by you. Find each product with web_search first (Amazon product pages look like amazon.com/.../dp/ASIN); use the 10-character ASIN from the page. Confirm the choice with them before calling this unless they were specific. Never say you ordered or bought anything.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Up to 10 products",
          items: {
            type: "object",
            properties: {
              asin: { type: "string", description: "Amazon ASIN, 10 letters/digits, e.g. B0C1234567" },
              name: { type: "string", description: "Short product name" },
              quantity: { type: "integer", description: "1–10" },
              price: { type: "string", description: "Price you saw, e.g. \"$24.99\" (optional)" },
            },
            required: ["asin", "name"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_post",
    description: "Draft a post for their connected Facebook Page. It is NOT published until they approve it (Post in the app, or YES by text). Write it in their voice for their audience; keep it natural, no hashtag spam. Never say it's posted.",
    input_schema: {
      type: "object",
      properties: { message: { type: "string", description: "The post text" } },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_call",
    description: "Draft a phone call YOU (Velo) will make for them — e.g. book a table, confirm or move an appointment, ask a business a question. You'll say you're an AI assistant calling for them. It is NOT placed until they approve it in the app. Afterwards you'll report back what happened. Include every detail you'll need on the call in goal (names, dates, times, party size, callback number if they want one).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "A saved contact's name, or a 10-digit number" },
        goal: { type: "string", description: "What to get done on the call, with all the details" },
      },
      required: ["to", "goal"],
      additionalProperties: false,
    },
  },
];

async function resolveTo(c: Caller, to: unknown): Promise<{ name: string | null; phone: string }> {
  const raw = clean(to, 80);
  const direct = toE164(raw);
  if (direct) {
    const [hit] = await sql()`select name from velo_contacts where user_id = ${c.userId} and phone = ${direct}`;
    return { name: hit ? String(hit.name) : null, phone: direct };
  }
  const [hit] = await sql()`select name, phone from velo_contacts where user_id = ${c.userId} and lower(name) = lower(${raw})`;
  if (!hit) throw new ProError(`There's no saved number for "${raw}". Ask them for the number, then save_contact and try again.`);
  return { name: String(hit.name), phone: String(hit.phone) };
}

export type Draft = { id: string; kind: "text" | "call" | "post" | "cart"; to_name: string | null; to_phone: string | null; body: string; status: string; result?: string | null };

type CartItem = { asin: string; name: string; quantity: number; price: string };
/** Amazon's "add to cart" link: opens their own cart with these items; they check out on Amazon. */
export function amazonCartUrl(items: CartItem[]) {
  const q = new URLSearchParams();
  items.forEach((it, i) => { q.set(`ASIN.${i + 1}`, it.asin); q.set(`Quantity.${i + 1}`, String(it.quantity)); });
  if (/^[\w-]{1,40}$/.test(process.env.AMAZON_ASSOCIATE_TAG || "")) q.set("AssociateTag", process.env.AMAZON_ASSOCIATE_TAG!);
  return `https://www.amazon.com/gp/aws/cart/add.html?${q}`;
}

/** Pro tools for this person: draft_post only once a Facebook Page is connected. */
export async function proToolsFor(userId: string) {
  const page = await connectedPageName(userId).catch(() => null);
  return { tools: page ? PRO_TOOLS : PRO_TOOLS.filter(t => t.name !== "draft_post"), page };
}

export async function runProTool(c: Caller, name: string, input: unknown, drafts: Draft[]): Promise<unknown> {
  const a = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const db = sql();
  if (name === "save_contact") {
    const n = clean(a.name, 80), phone = toE164(a.phone);
    if (!n) throw new ProError("Give the contact a name.");
    if (!phone) throw new ProError("That isn't a 10-digit US/Canada number. Ask them for it again.");
    const [{ count }] = await db`select count(*)::int as count from velo_contacts where user_id = ${c.userId}`;
    if (count >= 500) throw new ProError("Their contact list is full (500).");
    await db`insert into velo_contacts (user_id, name, phone) values (${c.userId}, ${n}, ${phone})
      on conflict (user_id, lower(name)) do update set phone = excluded.phone`;
    return { ok: true, name: n, phone: showPhone(phone) };
  }
  if (name === "list_contacts") {
    const rows = await db`select name, phone from velo_contacts where user_id = ${c.userId} order by lower(name) limit 200`;
    return rows.length ? { contacts: rows.map(r => ({ name: r.name, phone: showPhone(String(r.phone)) })) } : { result: "No contacts saved yet." };
  }
  if (name === "amazon_cart") {
    const items: CartItem[] = (Array.isArray(a.items) ? a.items : []).slice(0, 10).map((it: Record<string, unknown>) => ({
      asin: String(it?.asin || "").trim().toUpperCase(),
      name: clean(it?.name, 120),
      quantity: Math.min(10, Math.max(1, Math.round(Number(it?.quantity) || 1))),
      price: clean(it?.price, 20),
    }));
    if (!items.length) throw new ProError("Add at least one product.");
    const bad = items.find(it => !/^[A-Z0-9]{10}$/.test(it.asin) || !it.name);
    if (bad) throw new ProError(`"${bad.name || bad.asin}" needs its 10-character Amazon ASIN — find the product page with web_search first.`);
    const body = items.map(it => `${it.quantity} × ${it.name}${it.price ? ` (${it.price})` : ""}`).join("\n");
    const [row] = await db`insert into velo_actions (user_id, kind, to_name, body, status, result) values (${c.userId}, 'cart', 'Amazon', ${body}, 'done', ${amazonCartUrl(items)})
      returning id, kind, to_name, to_phone, body, status, result`;
    drafts.push(row as Draft);
    return { ok: true, items: items.length, tell_them: "Say their cart is ready: tap Open Amazon cart to review it and check out on Amazon (prices and delivery are confirmed there). Never say it's ordered." };
  }
  if (name === "draft_post") {
    const body = clean(a.message, 1500);
    if (body.length < 2) throw new ProError("Write the post.");
    const page = await connectedPageName(c.userId);
    if (!page) throw new ProError("They haven't connected a Facebook Page yet — Settings → Velo Pro → Facebook Page.");
    const [row] = await db`insert into velo_actions (user_id, kind, to_name, body) values (${c.userId}, 'post', ${page}, ${body})
      returning id, kind, to_name, to_phone, body, status`;
    drafts.push(row as Draft);
    return { ok: true, draft_id: row.id, page, tell_them: "Say it's ready for their Page and to tap Post (or reply YES if texting). Don't repeat the whole post. Never say it's posted." };
  }
  if (name === "draft_text" || name === "draft_call") {
    const kind = name === "draft_text" ? "text" : "call";
    const body = clean(kind === "text" ? a.message : a.goal, kind === "text" ? 1200 : 1000);
    if (body.length < 2) throw new ProError(kind === "text" ? "Write the message." : "Say what the call is for.");
    const to = await resolveTo(c, a.to);
    const [row] = await db`insert into velo_actions (user_id, kind, to_name, to_phone, body) values (${c.userId}, ${kind}, ${to.name}, ${to.phone}, ${body})
      returning id, kind, to_name, to_phone, body, status`;
    drafts.push(row as Draft);
    return { ok: true, draft_id: row.id, to: to.name || showPhone(to.phone),
      tell_them: kind === "text" ? "Say it's ready and to tap Send (or reply YES if you're texting). Don't repeat the whole message. Never say it's sent." : "Say the call is ready and to tap Call to let you place it (or reply YES if texting); you'll report back after. Never say you've called." };
  }
  throw new ProError("Unknown tool.");
}

/** The text that actually goes out: always says who it's from. */
export const outgoingText = (fromName: string, body: string) => `${fromName ? `${fromName} (via Velo)` : "Sent via Velo"}: ${body}`.slice(0, 1600);

/** Sends an approved text, places an approved call, or publishes an approved post. Checks Pro, ownership and daily limits. */
export async function runAction(req: NextRequest, c: Caller, id: string): Promise<{ ok: boolean; status: string; error?: string }> {
  const db = sql();
  const [u] = await db`select plan, name from users where id = ${c.userId}`;
  if (u?.plan !== "pro") return { ok: false, status: "pending", error: "Texts and calls are part of Velo Pro." };
  // Claim it: pending → approved, once.
  const [act] = await db`update velo_actions set status = 'approved', updated_at = now() where id = ${id} and user_id = ${c.userId} and status = 'pending' and kind in ('text', 'call', 'post')
    returning id, kind, to_phone, body`;
  if (!act) return { ok: false, status: "gone", error: "That draft was already handled." };
  const kind = act.kind as Kind;
  const [{ n }] = await db`select count(*)::int as n from velo_actions where user_id = ${c.userId} and kind = ${act.kind}
    and status in ('approved', 'calling', 'done') and created_at > now() - interval '1 day'`;
  if (n > DAILY[kind]) {
    await db`update velo_actions set status = 'pending' where id = ${id}`;
    return { ok: false, status: "pending", error: `That's the daily limit for ${kind}s (${DAILY[kind]}). Try again tomorrow.` };
  }
  if (kind === "post") {
    try {
      const page = await connectedPage(c.userId);
      if (!page) throw new Error("not connected");
      const postId = await publish(page, String(act.body));
      await db`update velo_actions set status = 'done', result = ${postId.slice(0, 200)}, updated_at = now() where id = ${id}`;
      return { ok: true, status: "done" };
    } catch (e) {
      const msg = e instanceof Error && e.message === "not connected" ? "Your Facebook Page isn't connected anymore — Settings → Velo Pro." : fbErrorMessage(e);
      await db`update velo_actions set status = 'failed', result = ${msg}, updated_at = now() where id = ${id}`;
      return { ok: false, status: "failed", error: msg };
    }
  }
  try {
    if (act.kind === "text") {
      const r = await sendSms(String(act.to_phone), outgoingText(String(u.name || "").split(" ")[0], String(act.body)));
      await db`update velo_actions set status = 'done', twilio_sid = ${r.sid}, updated_at = now() where id = ${id}`;
      return { ok: true, status: "done" };
    }
    const r = await startCall(String(act.to_phone), publicUrl(req, `/api/twilio/voice?a=${id}`), publicUrl(req, `/api/twilio/status?a=${id}`));
    await db`update velo_actions set status = 'calling', twilio_sid = ${r.sid}, updated_at = now() where id = ${id}`;
    return { ok: true, status: "calling" };
  } catch (e) {
    console.error("action", e);
    await db`update velo_actions set status = 'failed', result = ${String(e instanceof Error ? e.message : e).slice(0, 300)}, updated_at = now() where id = ${id}`;
    return { ok: false, status: "failed", error: act.kind === "text" ? "The text didn't go through." : "The call couldn't be placed." };
  }
}
