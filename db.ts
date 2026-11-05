// Neon Postgres, used only from server routes. Every query that touches a
// person's data is scoped to their user_id.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return (client ??= neon(process.env.DATABASE_URL));
}
