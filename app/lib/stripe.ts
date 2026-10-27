// 💳 Velo Pro billing (Stripe). Plain REST, no SDK.
// Env: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_WEBHOOK_SECRET.
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

// Stripe takes form-encoded bodies with nested keys like line_items[0][price].
function encode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(...encode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(path: string, body?: Record<string, unknown>, method: "POST" | "GET" = "POST"): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY isn't set.");
  const res = await fetch(`${process.env.STRIPE_API_URL || "https://api.stripe.com/v1"}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body && method === "POST" ? encode(body).join("&") : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data as T;
}

/** Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.payload", at most 5 minutes old. */
export function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = header.split(",").map(p => p.split("="));
  const t = parts.find(p => p[0] === "t")?.[1];
  const sigs = parts.filter(p => p[0] === "v1").map(p => p[1]);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  return sigs.some(s => { const got = Buffer.from(s); return got.length === want.length && timingSafeEqual(got, want); });
}

export type StripeSubscription = { id: string; status: string; customer: string; metadata?: Record<string, string> };
const LIVE = ["active", "trialing", "past_due"];

/** Applies a subscription's current state to the account (the only place plan is written). */
export async function applySubscription(sub: StripeSubscription, userId?: string) {
  const plan = LIVE.includes(sub.status) ? "pro" : "free";
  const uid = userId || sub.metadata?.velo_user_id;
  if (uid) await sql()`update users set plan = ${plan}, subscription_status = ${sub.status}, stripe_customer_id = ${sub.customer}, updated_at = now() where id = ${uid}`;
  else await sql()`update users set plan = ${plan}, subscription_status = ${sub.status}, updated_at = now() where stripe_customer_id = ${sub.customer}`;
}
