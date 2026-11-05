// 📱 Velo's own phone number (Twilio): texts and calls she makes for Pro
// members, and the texts/calls they make to her. Plain REST, no SDK.
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (her number, +1XXXXXXXXXX).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { phoneDigits, isValidPhone, formatPhone } from "./contact";

const API = "https://api.twilio.com/2010-04-01";
export const twilioReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
/** Her number for showing: 219-555-0142. */
export const veloNumber = () => (process.env.TWILIO_FROM ? formatPhone(process.env.TWILIO_FROM) : "");

/** US/Canada number → +1XXXXXXXXXX, or null. */
export const toE164 = (v: unknown) => (isValidPhone(v) ? `+1${phoneDigits(v)}` : null);
/** +12195550142 → 219-555-0142 */
export const showPhone = (e164: string) => formatPhone(e164);

async function twilio<T = Record<string, unknown>>(path: string, form: Record<string, string>): Promise<T> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const res = await fetch(`${process.env.TWILIO_API_URL || API}/Accounts/${sid}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Twilio error ${res.status}`);
  return data as T;
}

export const sendSms = (to: string, body: string) =>
  twilio<{ sid: string }>("Messages.json", { To: to, From: process.env.TWILIO_FROM!, Body: body.slice(0, 1600) });

/** Places a call; Twilio fetches what to say from `url` and reports the end to `statusUrl`. Capped at 10 minutes. */
export const startCall = (to: string, url: string, statusUrl: string) =>
  twilio<{ sid: string }>("Calls.json", { To: to, From: process.env.TWILIO_FROM!, Url: url, StatusCallback: statusUrl, StatusCallbackEvent: "completed", TimeLimit: "600" });

/** The public URL Twilio called (behind Vercel's proxy). */
export function publicUrl(req: NextRequest, path?: string) {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  return `${proto}://${host}${path ?? u.pathname + u.search}`;
}

/** Twilio signs each webhook: HMAC-SHA1 over the URL plus the sorted form fields. */
export function validTwilio(req: NextRequest, params: URLSearchParams): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN, sig = req.headers.get("x-twilio-signature") || "";
  if (!token || !sig) return false;
  const data = publicUrl(req) + [...params.keys()].sort().map(k => k + params.get(k)).join("");
  const want = Buffer.from(createHmac("sha1", token).update(data).digest("base64"));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
const VOICE = "Polly.Joanna-Neural";
/** Spoken text, cleaned for text-to-speech ("Velo" is said "Vello"). */
const spoken = (t: string) => t.replace(/\[\[[^\]]*\]\]/g, "").replace(/[*_#`>|]/g, "").replace(/\bVelo\b/g, "Vello").replace(/\s+/g, " ").trim();

export const twiml = (inner: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
export const say = (t: string) => `<Say voice="${VOICE}">${esc(spoken(t))}</Say>`;
/** Say something, then listen for their answer (posted to `action`); silence goes to `onSilence`. */
export const sayAndListen = (t: string, action: string, onSilence: string) =>
  `<Gather input="speech" action="${esc(action)}" method="POST" speechTimeout="auto" timeout="7" language="en-US">${say(t)}</Gather><Redirect method="POST">${esc(onSilence)}</Redirect>`;
export const message = (t: string) => `<Message>${esc(t.slice(0, 1600))}</Message>`;
