import { NextResponse } from "next/server";
import { sql, dbUrl } from "../../lib/db";
import { usingSupabase, storageReady } from "../../lib/storage";

// 🩺 Is everything connected? Says what's set up and what's missing — never a key, password or
// address. Open /api/health in a browser.
export const dynamic = "force-dynamic";
export async function GET() {
  const url = dbUrl();
  const db: Record<string, unknown> = {
    connection: url ? (/neon\.tech/i.test(url) ? "Neon" : /supabase/i.test(url) ? "Supabase" : "Postgres") : "missing — no DATABASE_URL or POSTGRES_URL",
  };
  if (url) {
    try {
      const [r] = await sql()`select to_regclass('public.users') is not null as tables`;
      db.reachable = true; db.tables = r.tables ? "ready" : "missing — redeploy so the build creates them";
      if (r.tables) db.characters = (await sql()`select count(*)::int as n from chat_characters`)[0].n;
    } catch (e) {
      db.reachable = false;
      try { if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(url).hostname)) db.fix = "This is Supabase's direct address (IPv6 only). Use the Transaction pooler connection string (port 6543) instead."; } catch { /* not a URL */ }
      db.error = (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/gi, "[database address]").slice(0, 200);
    }
  }
  return NextResponse.json({
    database: db,
    files: storageReady() ? (usingSupabase() ? "Supabase Storage" : "Vercel Blob") : "missing — no Supabase keys or Blob token",
    ai: !!process.env.ANTHROPIC_API_KEY,
  }, { headers: { "Cache-Control": "no-store" } });
}
