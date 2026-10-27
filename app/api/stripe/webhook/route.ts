import { NextRequest, NextResponse } from "next/server";
import { stripe, verifyStripeSignature, applySubscription, type StripeSubscription } from "../../../lib/stripe";

// Stripe calls this whenever a Velo Pro subscription changes. The plan is only
// ever written from Stripe's own data, so the browser can't unlock Pro.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  // The signature is over the exact raw bytes, so read text, not JSON.
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature") || "", secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as { subscription?: string; client_reference_id?: string };
      if (s.subscription) await applySubscription(await stripe<StripeSubscription>(`subscriptions/${s.subscription}`, undefined, "GET"), s.client_reference_id || undefined);
    } else if (event.type.startsWith("customer.subscription.")) {
      // Events can arrive late or out of order, so apply the subscription's current state.
      const { id } = event.data.object as { id: string };
      await applySubscription(await stripe<StripeSubscription>(`subscriptions/${id}`, undefined, "GET"));
    }
  } catch (e) {
    console.error("stripe webhook", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}
