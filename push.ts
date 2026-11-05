// 🔔 Web push: notifications to their phone or computer (installed app / browser), sent with
// VAPID keys the server makes for itself and keeps in the database (never in code or chat).
import webpush from "web-push";
import { sql } from "./db";

let cached: { publicKey: string; privateKey: string } | null = null;
/** The server's push keys (made once, on first use). */
export async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  if (cached) return cached;
  const [row] = await sql()`select value from app_config where key = 'vapid'`;
  if (row) return (cached = row.value as { publicKey: string; privateKey: string });
  const keys = webpush.generateVAPIDKeys();
  await sql()`insert into app_config (key, value) values ('vapid', ${JSON.stringify(keys)}::jsonb) on conflict (key) do nothing`;
  const [again] = await sql()`select value from app_config where key = 'vapid'`;
  return (cached = again.value as { publicKey: string; privateKey: string });
}

export type PushPayload = { title: string; body: string; url: string; icon?: string; tag?: string };

/** Sends to every device they turned notifications on for; forgets devices that are gone. Returns how many got it. */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  const subs = await sql()`select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
  if (!subs.length) return 0;
  const k = await vapid();
  const subject = process.env.VAPID_SUBJECT || "https://velo.app";
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } }, JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 6 * 3600, urgency: "normal" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sql()`delete from push_subscriptions where id = ${s.id}`;
      else console.error("push: send", code, e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
  return sent;
}
