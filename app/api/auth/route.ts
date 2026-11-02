import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { allow, SIGN_IN_LIMITS } from "../../lib/rateLimit";
import { checkPassword, endSession, hashPassword, resolveCaller, sameOrigin, startSession } from "../../lib/caller";

// 🔑 Accounts. POST { action: "signup" | "signin" | "signout" | "me", email?, password? }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD = "That email and password don't match.";

export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "me") {
      const c = await resolveCaller(req);
      return NextResponse.json({ user: c ? { id: c.userId, email: c.email } : null });
    }
    if (action === "signout") {
      const res = NextResponse.json({ ok: true });
      await endSession(req, res);
      return res;
    }
    if (action !== "signup" && action !== "signin") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const password = String(body.password || "");
    if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email, like you@example.com." }, { status: 400 });
    if (password.length < 8 || password.length > 200) return NextResponse.json({ error: "Passwords are 8 or more characters." }, { status: 400 });
    // The client can prepend anything to X-Forwarded-For; the proxy's own entry is the last one.
    const ip = req.headers.get("x-real-ip")?.trim() || (req.headers.get("x-forwarded-for") || "").split(",").pop()?.trim() || "local";
    if (!allow(`signin:${email}`, SIGN_IN_LIMITS) || !allow(`signin-ip:${ip}`, SIGN_IN_LIMITS)) {
      return NextResponse.json({ error: "Too many tries — wait a few minutes and try again." }, { status: 429 });
    }

    let userId: string;
    if (action === "signup") {
      const rows = await sql()`insert into users (email, password_hash) values (${email}, ${await hashPassword(password)})
        on conflict (email) do nothing returning id`;
      if (!rows[0]) return NextResponse.json({ error: "There's already an account with that email — sign in instead." }, { status: 409 });
      userId = String(rows[0].id);
    } else {
      const rows = await sql()`select id, password_hash from users where email = ${email}`;
      if (!rows[0] || !(await checkPassword(password, String(rows[0].password_hash)))) return NextResponse.json({ error: BAD }, { status: 401 });
      userId = String(rows[0].id);
    }
    const res = NextResponse.json({ user: { id: userId, email } });
    await startSession(res, userId);
    // Tidy up long-expired sessions now and then.
    if (Math.random() < 0.05) await sql()`delete from sessions where expires_at < now()`;
    return res;
  } catch (e) {
    console.error("auth", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
