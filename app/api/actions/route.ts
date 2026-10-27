import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { runAction } from "../../lib/pro";

// ✅ Texts and calls Velo drafted: the person approves (Send / Call) or cancels each one.
// POST { action: "approve" | "cancel" | "get", id } → { ok, status, error?, result? }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const id = String(b.id || "");
    if (!UUID.test(id)) return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
    if (b.action === "approve") {
      const r = await runAction(req, c, id);
      return NextResponse.json(r, { status: r.ok ? 200 : r.status === "gone" ? 409 : 400 });
    }
    if (b.action === "cancel") {
      await sql()`update velo_actions set status = 'cancelled', updated_at = now() where id = ${id} and user_id = ${c.userId} and status = 'pending'`;
      return NextResponse.json({ ok: true, status: "cancelled" });
    }
    if (b.action === "get") {
      const [a] = await sql()`select status, result from velo_actions where id = ${id} and user_id = ${c.userId}`;
      return a ? NextResponse.json({ ok: true, status: a.status, result: a.result }) : NextResponse.json({ error: "Unknown draft." }, { status: 404 });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("actions", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
