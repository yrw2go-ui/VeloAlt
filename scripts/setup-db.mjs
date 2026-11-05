// 🗄️ Runs before each build: sets up an empty database (e.g. a fresh Supabase project linked in
// Vercel) from db/schema.sql, and keeps Supabase's public Data API from reading any table
// (row level security on, no policies — the app itself connects as the owner, so it's unaffected).
// The first time, it also adds the starter characters (db/seeds/starter-characters.sql).
// Does nothing when there's no database URL (e.g. a local build without one).
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { importImages } from "./import-images.mjs";

// Also finds prefixed names (e.g. STORAGE_POSTGRES_URL) that Vercel's storage links can add.
const envAny = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; for (const n of names) { const k = Object.keys(process.env).find(k => k.endsWith(`_${n}`) && process.env[k]); if (k) return process.env[k]; } return ""; };
// Candidates in order: the pooled address first — Supabase's direct "db.<ref>.supabase.co" address is
// IPv6-only, which Vercel's build machines can't reach — then the others.
const isDirect = url => { try { return /^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(url).hostname); } catch { return false; } };
const allOf = name => Object.keys(process.env).filter(k => (k === name || k.endsWith(`_${name}`)) && process.env[k]).map(k => process.env[k]);
const candidates = [...new Set([process.env.DATABASE_URL, ...allOf("POSTGRES_URL"), ...allOf("POSTGRES_PRISMA_URL"), ...allOf("POSTGRES_URL_NON_POOLING")].filter(Boolean))]
  .sort((a, b) => Number(isDirect(a)) - Number(isDirect(b)));
if (!candidates.length) { console.log("setup-db: no database URL, skipping"); process.exit(0); }
if (/neon\.tech/i.test(candidates[0])) { console.log("setup-db: Neon database, skipping (migrations are applied by hand)"); process.exit(0); }

const clean = url => { try { const u = new URL(url); u.search = ""; return u.toString(); } catch { return url; } };
let sql = null;
for (const url of candidates) {
  const c = clean(url);
  const s = postgres(c, { ssl: /localhost|127\.0\.0\.1/.test(c) ? false : "require", prepare: false, max: 1, connect_timeout: 15, onnotice: () => {} });
  try { await s`select 1`; sql = s; break; }
  catch (e) {
    const direct = isDirect(url);
    console.warn(`setup-db: can't reach ${direct ? "Supabase's direct address (IPv6 only)" : "a database address"}: ${e?.code || e?.message || e}`);
    await s.end({ timeout: 1 }).catch(() => {});
  }
}
// Never block the deploy over this: the app still starts, and /api/health says what's wrong.
if (!sql) { console.warn("setup-db: no reachable database — skipped. Use Supabase's Transaction pooler connection string (port 6543) as POSTGRES_URL."); process.exit(0); }
try {
  const [{ ready }] = await sql`select to_regclass('public.users') is not null as ready`;
  if (!ready) {
    console.log("setup-db: empty database, creating the tables…");
    await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
    console.log("setup-db: tables created");
  } else {
    console.log("setup-db: tables already there");
    // Newer additions (025 onward) are written to be safe to run again; apply them every build.
    const { readdirSync } = await import("node:fs");
    for (const f of readdirSync(new URL("../db/migrations/", import.meta.url)).filter(f => /^(\d{3})-.*\.sql$/.test(f) && Number(f.slice(0, 3)) >= 25).sort()) {
      await sql.unsafe(readFileSync(new URL(`../db/migrations/${f}`, import.meta.url), "utf8"));
    }
  }
  // 🔧 Repair JSON that an earlier version saved as a quoted string instead of as data.
  for (const [t, c] of [["app_config", "value"], ["chat_characters", "traits"], ["velo_actions", "transcript"]]) {
    const r = await sql.unsafe(`update public.${t} set ${c} = (${c} #>> '{}')::jsonb where jsonb_typeof(${c}) = 'string' and left(${c} #>> '{}', 1) in ('{', '[')`);
    if (r.count) console.log(`setup-db: repaired ${r.count} ${t} row(s)`);
  }
  // 🎭 Anya, Hailey and Allie (copied from Velo), added once the same way.
  const [mine] = await sql`select 1 from app_config where key = 'my_characters_seeded'`;
  if (!mine) {
    await sql.unsafe(readFileSync(new URL("../db/seeds/my-characters.sql", import.meta.url), "utf8"));
    await sql`insert into app_config (key, value) values ('my_characters_seeded', ${sql.json({ at: new Date().toISOString() })}) on conflict (key) do nothing`;
    console.log("setup-db: Anya, Hailey and Allie added");
  }
  // 🌟 The starter characters, added once (a character deleted later doesn't come back).
  const [seeded] = await sql`select 1 from app_config where key = 'starter_characters_seeded'`;
  if (!seeded) {
    await sql.unsafe(readFileSync(new URL("../db/seeds/starter-characters.sql", import.meta.url), "utf8"));
    await sql`insert into app_config (key, value) values ('starter_characters_seeded', ${sql.json({ at: new Date().toISOString() })}) on conflict (key) do nothing`;
    console.log("setup-db: starter characters added");
  }
  // 🖼️ Anya's, Hailey's and Allie's pictures from Velo (once there's an admin to own them).
  try { await importImages(sql); } catch (e) { console.warn(`setup-db: pictures not copied: ${e?.message || e}`); }
  const tables = await sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
  for (const t of tables) await sql.unsafe(`alter table public."${t.tablename.replace(/"/g, '""')}" enable row level security`);
  if (tables.length) console.log(`setup-db: locked ${tables.length} table(s) from the public Data API`);
} finally { await sql.end(); }
