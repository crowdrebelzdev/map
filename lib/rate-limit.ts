import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publicRateLimit } from "@/db/schema";
import { headers } from "next/headers";

/** Fixed-window rate limiter for anonymous/public traffic, backed by the `publicRateLimit`
 * table (same reasoning as Better Auth's own database-backed limiter: this runs on
 * serverless, so in-memory counters wouldn't hold up across invocations). Best-effort, not
 * perfectly atomic under concurrent requests for the same key — fine for a low-stakes abuse
 * deterrent, not a security-critical guarantee. Returns `true` when the request is allowed. */
export async function checkRateLimit(key: string, opts: { windowMs: number; max: number }): Promise<boolean> {
  const now = Date.now();
  const existing = await db.query.publicRateLimit.findFirst({ where: eq(publicRateLimit.key, key) });

  if (!existing || now - existing.lastRequest > opts.windowMs) {
    await db
      .insert(publicRateLimit)
      .values({ key, count: 1, lastRequest: now })
      .onConflictDoUpdate({ target: publicRateLimit.key, set: { count: 1, lastRequest: now } });
    return true;
  }

  if (existing.count >= opts.max) return false;

  await db
    .update(publicRateLimit)
    .set({ count: existing.count + 1, lastRequest: now })
    .where(eq(publicRateLimit.key, key));
  return true;
}

/** Best-effort client IP for anonymous rate-limiting keys — Vercel sets `x-forwarded-for`;
 * falls back to a constant so a missing header degrades to "one shared bucket" rather than
 * throwing. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
