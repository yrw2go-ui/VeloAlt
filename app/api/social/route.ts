import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { makeState, STATE_TTL_MS } from "../../lib/fbCrypto";
import { connectionStatus, disconnect, fbConfigured, pickPending, redirectUri, FB_SCOPES, GRAPH_VERSION, NONCE_COOKIE } from "../../lib/facebook";

// 📣 Facebook Page for Velo Pro.
// POST { action: "status" }            → { configured, connected, pageName, choices }
// POST { action: "connect" }           → { url } (Facebook Login; signed state + nonce cookie)
// POST { action: "pick", pageId }      → connects one of several Pages
// POST { action: "disconnect" }
export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    if (b.action === "status") return NextResponse.json(await connectionStatus(c.userId));
    if (b.action === "disconnect") { await disconnect(c.userId); return NextResponse.json({ ok: true }); }

    const [u] = await sql()`select plan from users where id = ${c.userId}`;
    if (u?.plan !== "pro") return NextResponse.json({ error: "Posting to Facebook is part of Velo Pro." }, { status: 403 });
    if (!fbConfigured()) return NextResponse.json({ error: "Facebook isn't set up for Velo yet." }, { status: 503 });

    if (b.action === "connect") {
      if (!allow(`fb:${c.userId}`, [{ ms: 3_600_000, max: 10 }])) return NextResponse.json({ error: "Too many tries — wait a bit." }, { status: 429 });
      const { state, nonce } = makeState(c.userId);
      const q = new URLSearchParams({ client_id: process.env.FACEBOOK_APP_ID!, redirect_uri: redirectUri(new URL(req.url).origin), state, response_type: "code" });
      // Facebook Login for Business uses a configuration (its permissions are set there); plain Facebook Login uses scopes.
      if (process.env.FACEBOOK_LOGIN_CONFIG_ID) q.set("config_id", process.env.FACEBOOK_LOGIN_CONFIG_ID);
      else q.set("scope", FB_SCOPES.join(","));
      const res = NextResponse.json({ url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${q}` });
      res.cookies.set(NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/social", maxAge: STATE_TTL_MS / 1000 });
      return res;
    }
    if (b.action === "pick") {
      const p = await pickPending(c.userId, String(b.pageId || ""));
      return p ? NextResponse.json({ ok: true, pageName: p.name }) : NextResponse.json({ error: "That choice expired — connect Facebook again." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("social", e instanceof Error ? e.message : "failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
