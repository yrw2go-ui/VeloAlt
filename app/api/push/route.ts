import { NextRequest, NextResponse } from "next/server";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { sql } from "../../lib/db";
import { vapid, sendPush } from "../../lib/push";

// 🔔 Push notifications for this person.
//   GET                                   → { publicKey }  (for the browser to subscribe)
//   POST { action: "subscribe", subscription } | { action: "unsubscribe", endpoint } | { action: "test" }
export async function GET() {
  return NextResponse.json({ publicKey: (await vapid()).publicKey });
}
export async function POST(req: NextRequest) {
  const c = await resolveCaller(req);
  if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!allow(`push:${c.userId}`, [{ ms: 60_000, max: 10 }])) return NextResponse.json({ error: "Too many tries — wait a minute." }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "subscribe") {
    const s = b.subscription || {};
    const endpoint = String(s.endpoint || ""), p256dh = String(s.keys?.p256dh || ""), auth = String(s.keys?.auth || "");
    if (!/^https?:\/\//.test(endpoint) || endpoint.length > 1000 || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) return NextResponse.json({ error: "That device couldn't be added." }, { status: 400 });
    await sql()`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (${c.userId}, ${endpoint}, ${p256dh}, ${auth})
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
    return NextResponse.json({ ok: true });
  }
  if (b.action === "unsubscribe") {
    await sql()`delete from push_subscriptions where user_id = ${c.userId} and endpoint = ${String(b.endpoint || "")}`;
    return NextResponse.json({ ok: true });
  }
  if (b.action === "test") {
    const n = await sendPush(c.userId, { title: "Velo", body: "Notifications are on 🎉 — I'll text you now and then.", url: "/?chat=velo", icon: "/icon-192.png", tag: "test" });
    return NextResponse.json({ ok: n > 0, sent: n });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
