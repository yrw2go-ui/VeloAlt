import { NextRequest, NextResponse } from "next/server";
import { runCheckins } from "../../../lib/checkins";
import { planNudges } from "../../../lib/plans";

// ⏰ Run by Vercel's scheduler (see vercel.json): sends this round's check-ins.
// With CRON_SECRET set in Vercel, only calls carrying it are accepted; otherwise only Vercel's
// scheduler. Either way the per-person limits (time of day, once/twice a day) still apply.
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : /vercel-cron/i.test(req.headers.get("user-agent") || "");
  if (!ok) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try { const plans = await planNudges().catch(e => { console.error("cron plans", e instanceof Error ? e.message : e); return 0; }); return NextResponse.json({ ...(await runCheckins()), plans }); }
  catch (e) { console.error("cron checkins", e instanceof Error ? e.message : e); return NextResponse.json({ error: "failed" }, { status: 500 }); }
}
