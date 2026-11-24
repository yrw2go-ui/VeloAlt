// Postgres (Supabase or any standard Postgres), used only from server routes.
// Every query that touches a person's data is scoped to their user_id.
import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      // Supabase transaction pooler (port 6543) works best with these:
      ssl: "require",
      // 🔌 A few connections per invocation, not one. With one, a second request landing on the
      // same instance waited for the first to finish — no statement running, so no statement
      // timeout to save it, and it sat there until Vercel gave up at 300 seconds. One connection
      // was right when this talked to Postgres directly, where connections are scarce; through the
      // pooler they are cheap, which is what the pooler is for.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,            // required for transaction pooler
    });
  }
  return client;
}

/** First non-empty env var among the names given (or ""). */
export function envAny(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

/** The database URL currently in use (or ""). */
export function dbUrl(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

/** True when a query named a table or column this database does not have yet. */
export function missingSchema(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "42703" || code === "42P01";
}
