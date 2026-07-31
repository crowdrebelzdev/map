import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Kept low on purpose: this runs on Amplify's Lambda-based SSR compute (see the comment in
// lib/storage.ts), so every concurrent Lambda instance gets its own Pool — a high `max` here
// multiplies into far more DB connections than intended once traffic spreads across many
// instances. `idleTimeoutMillis` releases unused connections quickly instead of holding them
// open for the lifetime of a warm-but-idle Lambda container.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  // Some managed Postgres providers (observed on Neon) hand out connections with an empty
  // `search_path` by default, which breaks every unqualified table reference Drizzle
  // generates (e.g. `"event"` instead of `"public"."event"`). `onConnect` is awaited by
  // pg-pool before the client is handed back to a caller, so this runs atomically before
  // any real query — unlike a `pool.on("connect", ...)` listener, which fires without
  // being awaited and used to race the first real query on the same client (visible in
  // prod logs as a "client.query() when the client is already executing a query"
  // deprecation warning). Deliberately not the startup-packet `options` field either:
  // Neon's pooled (PgBouncer) endpoint rejects arbitrary startup parameters outright.
  // Provider-agnostic: a no-op on setups where `public` was already on the path.
  onConnect: (client) => client.query("SET search_path TO public"),
});

export const db = drizzle(pool, { schema });
