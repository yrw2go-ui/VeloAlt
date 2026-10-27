import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller, sameOrigin } from "../../lib/caller";
import { stripe } from "../../lib/stripe";
import { publicUrl } from "../../lib/twilio";

// 💳 Velo Pro: start a subscription (Stripe Checkout) or manage it (Billing Portal).
// POST { action: "checkout" | "portal" } → { url }
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const [u] = await sql()`select plan, stripe_customer_id from users where id = ${c.userId}`;
    const back = publicUrl(req, "/?tab=settings");

    if (b.action === "portal") {
      if (!u?.stripe_customer_id) return NextResponse.json({ error: "No subscription yet." }, { status: 400 });
      const s = await stripe<{ url: string }>("billing_portal/sessions", { customer: u.stripe_customer_id, return_url: back });
      return NextResponse.json({ url: s.url });
    }
    if (b.action === "checkout") {
      if (u?.plan === "pro") return NextResponse.json({ error: "You already have Velo Pro — use Manage billing." }, { status: 409 });
      const price = process.env.STRIPE_PRICE_PRO;
      if (!price) return NextResponse.json({ error: "Velo Pro isn't available to buy just yet." }, { status: 503 });
      const s = await stripe<{ url: string }>("checkout/sessions", {
        mode: "subscription",
        line_items: { 0: { price, quantity: 1 } },
        client_reference_id: c.userId,
        ...(u?.stripe_customer_id ? { customer: u.stripe_customer_id } : { customer_email: c.email }),
        subscription_data: { metadata: { velo_user_id: c.userId } },
        success_url: `${back}&upgraded=1`,
        cancel_url: back,
        allow_promotion_codes: true,
      });
      return NextResponse.json({ url: s.url });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("billing", e);
    return NextResponse.json({ error: "Billing is unavailable right now. Please try again." }, { status: 500 });
  }
}
