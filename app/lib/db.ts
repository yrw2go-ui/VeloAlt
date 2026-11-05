// Postgres, used only from server routes. Every query that touches a person's
// data is scoped to their user_id.
// Works with Supabase (or any Postgres) through a normal connection, and with Neon
// through its serverless driver when DATABASE_URL points at neon.tech.
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

let client: Sql | null = null;
export function sql(): Sql {
  // DATABASE_URL, or the POSTGRES_URL that Vercel's Supabase integration adds.
  const url = dbUrl();
  if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL) is not set");
  if (client) return client;
  if (/neon\.tech/i.test(url)) return (client = neon(url) as unknown as Sql);
  // Supabase: use the pooler connection string (port 6543) on Vercel. Prepared statements are
  // off for the pooler; dates and times come back as text, the same as with Neon.
  const raw = (x: string) => x;
  const pg = postgres(cleanUrl(url), {
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    types: {
      rawDates: { to: 1184, from: [1082, 1083, 1114, 1184, 1266], serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)), parse: raw },
      // JSON text passed for a json/jsonb value (`${JSON.stringify(x)}::jsonb`) goes in as is, as with
      // Neon — not encoded a second time into a JSON string.
      json: { to: 3802, from: [114, 3802], serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) },
    },
  });
  return (client = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pg(strings, ...(values as any[])).then(r => Array.from(r) as Row[])) as Sql);
}

/** The first env var set among these names — also with a prefix, as Vercel's storage links can
 *  add one (e.g. STORAGE_POSTGRES_URL). */
export function envAny(...names: string[]): string {
  for (const n of names) if (process.env[n]) return process.env[n]!;
  for (const n of names) {
    const k = Object.keys(process.env).find(k => k.endsWith(`_${n}`) && process.env[k]);
    if (k) return process.env[k]!;
  }
  return "";
}
// Supabase's direct "db.<ref>.supabase.co" address is IPv6-only (Vercel can't reach it): a pooler
// address, when there is one, comes first.
const isDirect = (url: string) => { try { return /^db\.[a-z0-9]+\.supabase\.co$/i.test(new URL(url).hostname); } catch { return false; } };
export function dbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const all = Object.keys(process.env).filter(k => /(^|_)POSTGRES_(URL|PRISMA_URL)$/.test(k) && process.env[k]).map(k => process.env[k]!);
  return all.find(u => !isDirect(u)) || all[0] || envAny("POSTGRES_URL_NON_POOLING");
}

/** The connection string without its query options (e.g. ?sslmode=require&supa=…) — the
 *  driver would send unknown ones to the server, which refuses them. SSL is set above. */
export function cleanUrl(url: string): string {
  try { const u = new URL(url); u.search = ""; return u.toString(); } catch { return url; }
}
