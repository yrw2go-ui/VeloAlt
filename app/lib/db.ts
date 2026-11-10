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
      max: 1,                    // one connection per serverless invocation
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
