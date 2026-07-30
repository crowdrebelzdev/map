import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Some managed Postgres providers (observed on Neon) hand out connections with an empty
// `search_path` by default, which breaks every unqualified table reference Drizzle
// generates (e.g. `"event"` instead of `"public"."event"`). Setting it explicitly per
// connection is provider-agnostic and a no-op on setups where `public` was already on the
// path (e.g. local Postgres).
pool.on("connect", (client) => {
  client.query("SET search_path TO public");
});

export const db = drizzle(pool, { schema });
