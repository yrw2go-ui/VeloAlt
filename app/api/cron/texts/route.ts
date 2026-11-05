import { NextRequest, NextResponse } from "next/server";
import { deliverPromises } from "../../../lib/promise-delivery";

// ⏰ Run every minute by Vercel's scheduler (see vercel.json): sends the texts characters promised.
// Same access rule as the check-ins cron.
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!ok) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try { return NextResponse.json({ sent: await deliverPromises() }); }
  catch (e) { console.error("cron texts", e instanceof Error ? e.message : e); return NextResponse.json({ error: "failed" }, { status: 500 }); }
}
