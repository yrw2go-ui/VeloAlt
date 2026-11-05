import { NextRequest, NextResponse } from "next/server";
import { readState } from "../../../lib/fbCrypto";
import { allow } from "../../../lib/rateLimit";
import { NONCE_COOKIE, pagesFromCode, redirectUri, savePage, savePending } from "../../../lib/facebook";

// 📣 Facebook Login sends the person back here. Register this exact address in
// the Meta app: https://<your-domain>/api/social/callback
// One Page → connected. Several → they pick one in Settings.
// Back to the app with ?tab=settings&fb=connected | pick | nopages | cancelled | error.
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const origin = process.env.APP_ORIGIN || u.origin;
  const back = (result: string) => {
    const res = NextResponse.redirect(`${origin}/?tab=settings&fb=${result}`, 303);
    res.cookies.set(NONCE_COOKIE, "", { httpOnly: true, path: "/api/social", maxAge: 0 });
    return res;
  };
  let userId: string | null = null;
  try { userId = readState(u.searchParams.get("state") || "", req.cookies.get(NONCE_COOKIE)?.value); } catch { userId = null; }
  if (!userId) return back("error");
  if (u.searchParams.get("error")) return back("cancelled");
  const code = u.searchParams.get("code") || "";
  if (!code || code.length > 2000) return back("error");
  if (!allow(`fb:${userId}`, [{ ms: 3_600_000, max: 10 }])) return back("error");
  try {
    const pages = await pagesFromCode(code, redirectUri(u.origin));
    if (!pages.length) return back("nopages");
    if (pages.length === 1) { await savePage(userId, pages[0]); return back("connected"); }
    await savePending(userId, pages);
    return back("pick");
  } catch (e) {
    console.error("[social-callback]", e instanceof Error ? e.message : "failed");
    return back("error");
  }
}
