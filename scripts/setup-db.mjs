// 🗄️ Runs before each build: sets up an empty database (e.g. a fresh Supabase project linked in
// Vercel) from db/schema.sql, and keeps Supabase's public Data API from reading any table
// (row level security on, no policies — the app itself connects as the owner, so it's unaffected).
// The first time, it also adds the starter characters (db/seeds/starter-characters.sql).
// Does nothing when there's no database URL (e.g. a local build without one).
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!url) { console.log("setup-db: no database URL, skipping"); process.exit(0); }
if (/neon\.tech/i.test(url)) { console.log("setup-db: Neon database, skipping (migrations are applied by hand)"); process.exit(0); }

const clean = (() => { try { const u = new URL(url); u.search = ""; return u.toString(); } catch { return url; } })();
const local = /localhost|127\.0\.0\.1/.test(clean);
const sql = postgres(clean, { ssl: local ? false : "require", prepare: false, max: 1, connect_timeout: 20, onnotice: () => {} });
try {
  const [{ ready }] = await sql`select to_regclass('public.users') is not null as ready`;
  if (!ready) {
    console.log("setup-db: empty database, creating the tables…");
    await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
    console.log("setup-db: tables created");
  } else console.log("setup-db: tables already there");
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
  const tables = await sql`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
  for (const t of tables) await sql.unsafe(`alter table public."${t.tablename.replace(/"/g, '""')}" enable row level security`);
  if (tables.length) console.log(`setup-db: locked ${tables.length} table(s) from the public Data API`);
} finally { await sql.end(); }
