import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { allow } from "../../lib/rateLimit";
import { PHONE_MSG } from "../../lib/contact";
import { sendSms, toE164, twilioReady } from "../../lib/twilio";

// 📱 The owner's own phone number, verified with a 6-digit code by text. It's
// how Velo knows it's them when they text or call her number (Velo Pro).
// POST { action: "send", phone } | { action: "verify", code } | { action: "remove" }
const hash = (code: string, userId: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const db = sql();
    const [u] = await db`select plan from users where id = ${c.userId}`;
    if (u?.plan !== "pro" || !twilioReady()) return NextResponse.json({ error: "Texting and calling Velo are part of Velo Pro." }, { status: 403 });

    if (b.action === "send") {
      const phone = toE164(b.phone);
      if (!phone) return NextResponse.json({ error: PHONE_MSG }, { status: 400 });
      if (!allow(`phone:${c.userId}`, [{ ms: 600_000, max: 3 }, { ms: 86_400_000, max: 10 }])) return NextResponse.json({ error: "Too many codes — wait a bit and try again." }, { status: 429 });
      const [taken] = await db`select 1 from users where phone = ${phone} and phone_verified_at is not null and id <> ${c.userId}`;
      if (taken) return NextResponse.json({ error: "That number is already linked to another Velo account." }, { status: 409 });
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db`update users set phone = ${phone}, phone_verified_at = null, phone_code_hash = ${hash(code, c.userId)},
        phone_code_expires = now() + interval '10 minutes', phone_code_tries = 0 where id = ${c.userId}`;
      await sendSms(phone, `Your Velo code is ${code}. It expires in 10 minutes.`);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "verify") {
      const code = String(b.code || "").replace(/\D/g, "");
      const [row] = await db`update users set phone_code_tries = phone_code_tries + 1 where id = ${c.userId}
        returning phone, phone_code_hash, phone_code_expires > now() as fresh, phone_code_tries`;
      if (!row?.phone_code_hash || !row.fresh || row.phone_code_tries > 5) return NextResponse.json({ error: "That code expired — send a new one." }, { status: 400 });
      const want = Buffer.from(String(row.phone_code_hash)), got = Buffer.from(hash(code, c.userId));
      if (code.length !== 6 || want.length !== got.length || !timingSafeEqual(want, got)) return NextResponse.json({ error: "That code isn't right." }, { status: 400 });
      try {
        await db`update users set phone_verified_at = now(), phone_code_hash = null, phone_code_expires = null where id = ${c.userId}`;
      } catch {
        return NextResponse.json({ error: "That number is already linked to another Velo account." }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove") {
      await db`update users set phone = null, phone_verified_at = null, phone_code_hash = null where id = ${c.userId}`;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("phone", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
