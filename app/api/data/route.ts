import { NextRequest, NextResponse } from "next/server";
import { sql } from "../../lib/db";
import { resolveCaller } from "../../lib/caller";
import { isValidTimeZone } from "../../lib/localTime";
import { VELO_LOOKS } from "../../lib/veloAvatars";

// 📦 Everything the app reads and changes, for the signed-in person only.
// POST { action, ...args } → { ... }. Every query is scoped to their user_id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    if (!c) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const b = await req.json().catch(() => ({}));
    const db = sql(), me = c.userId;
    const id = String(b.id || "");
    const needId = () => UUID.test(id);

    switch (String(b.action || "")) {
      case "profile.get": {
        const [u] = await db`select name, look, time_zone from users where id = ${me}`;
        const [{ n }] = await db`select count(*)::int as n from velo_memories where user_id = ${me} and kind = 'call'`;
        return NextResponse.json({ name: u?.name || "", look: u?.look || "default", timeZone: u?.time_zone || null, hadCall: n > 0 });
      }
      case "profile.update": {
        if (typeof b.name === "string") await db`update users set name = ${clean(b.name, 80) || null}, updated_at = now() where id = ${me}`;
        if (typeof b.look === "string" && VELO_LOOKS.some(l => l.id === b.look)) await db`update users set look = ${b.look}, updated_at = now() where id = ${me}`;
        if (isValidTimeZone(b.timeZone)) await db`update users set time_zone = ${b.timeZone} where id = ${me}`;
        return NextResponse.json({ ok: true });
      }

      case "messages.list": {
        const rows = await db`select role, content from velo_messages where user_id = ${me} order by created_at desc, id desc limit 60`;
        return NextResponse.json({ messages: rows.reverse() });
      }
      case "messages.add": {
        const list = (Array.isArray(b.messages) ? b.messages : []).slice(0, 4)
          .map((m: { role?: string; content?: unknown }) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 8000) }))
          .filter((m: { content: string }) => m.content);
        // A millisecond apart so they always sort in the order sent.
        const at = Date.now() - list.length;
        for (const [i, m] of list.entries()) await db`insert into velo_messages (user_id, role, content, created_at) values (${me}, ${m.role}, ${m.content}, ${new Date(at + i).toISOString()})`;
        return NextResponse.json({ ok: true });
      }
      case "messages.clear":
        await db`delete from velo_messages where user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "reminders.list": {
        const rows = await db`select id, text, remind_at, status from velo_reminders where user_id = ${me} and status in ('pending', 'sent') order by remind_at limit 50`;
        return NextResponse.json({ reminders: rows });
      }
      case "reminders.due": {
        // Claims due reminders (marks them sent) so each pops up once.
        const rows = await db`update velo_reminders set status = 'sent', sent_at = now()
          where user_id = ${me} and status = 'pending' and remind_at <= now() returning id, text`;
        return NextResponse.json({ due: rows });
      }
      case "reminders.dismiss":
        if (!needId()) return bad("Unknown reminder.");
        await db`update velo_reminders set status = 'dismissed' where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "tasks.list": {
        const rows = await db`select id, text, due_date::text as due_date, done from velo_tasks
          where user_id = ${me} and (done = false or done_at > now() - interval '1 day') order by created_at limit 100`;
        return NextResponse.json({ tasks: rows });
      }
      case "tasks.add": {
        const text = clean(b.text, 300);
        if (!text) return bad("Say what the to-do is.");
        await db`insert into velo_tasks (user_id, text) values (${me}, ${text})`;
        return NextResponse.json({ ok: true });
      }
      case "tasks.toggle":
        if (!needId()) return bad("Unknown to-do.");
        await db`update velo_tasks set done = ${!!b.done}, done_at = ${b.done ? new Date().toISOString() : null} where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });
      case "tasks.delete":
        if (!needId()) return bad("Unknown to-do.");
        await db`delete from velo_tasks where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      case "memories.list": {
        const rows = await db`select id, kind, text, status, created_at from velo_memories where user_id = ${me} order by created_at desc limit 300`;
        return NextResponse.json({ memories: rows });
      }
      case "memories.delete":
        if (!needId()) return bad("Unknown memory.");
        await db`delete from velo_memories where id = ${id} and user_id = ${me}`;
        return NextResponse.json({ ok: true });

      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("data", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
