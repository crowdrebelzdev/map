import { cache } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { event } from "@/db/schema";

export const getEventBySlug = cache(async (slug: string) => {
  return db.query.event.findFirst({ where: eq(event.slug, slug) });
});

export async function requireEventBySlug(slug: string) {
  const ev = await getEventBySlug(slug);
  if (!ev) notFound();
  return ev;
}
