import { NextRequest, NextResponse } from "next/server";
import { deliverPromises } from "../../../lib/promise-delivery";
import { resendDue, checkMedia } from "../../../lib/media";
import { sql } from "../../../lib/db";
import { ensurePicaDays } from "../../../lib/picagram";

// ⏰ Run every minute by Vercel's scheduler (see vercel.json): sends the texts characters promised,
// and 📵 re-sends photos that wouldn't go through earlier ("my phone's acting up").
// Same access rule as the check-ins cron.
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!ok) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const sent = await deliverPromises();
    const resent = await resendDue().catch(e => { console.error("cron resend", e instanceof Error ? e.message : e); return 0; });
    // Keep the re-sent ones moving even when nobody has the app open.
    const due = await sql()`select id, user_id from velo_media where resent and status = 'working' order by coalesce(claimed_at, created_at) limit 5`;
    await Promise.all(due.map(m => checkMedia(String(m.user_id), String(m.id)).catch(() => null)));
    // 📸 Picagram keeps going even when nobody looks: one person's day of posts per minute, at most.
    let pica = 0;
    // (Paused for anyone who hasn't looked at Picagram in 4 days.)
    const active = await sql()`select u.id from users u where u.pica_looked_at > now() - interval '4 days'
      and not exists (select 1 from pica_days d where d.user_id = u.id and d.day >= current_date) order by random() limit 5`;
    for (const u of active) { if (pica) break; pica += await ensurePicaDays(String(u.id), 1, true).catch(() => 0); }
    return NextResponse.json({ sent, resent, pica });
  }
  catch (e) { console.error("cron texts", e instanceof Error ? e.message : e); return NextResponse.json({ error: "failed" }, { status: 500 }); }
}
