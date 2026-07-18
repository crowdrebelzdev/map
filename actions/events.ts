"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { event } from "@/db/schema";
import { requireAdminSession } from "@/lib/get-session";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export async function createEvent(formData: FormData) {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Naam is verplicht.");
  }

  let slug = slugify(name);
  const existing = await db.query.event.findFirst({
    where: eq(event.slug, slug),
  });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const [created] = await db.insert(event).values({ name, slug }).returning();

  redirect(`/admin/events/${created.id}/map`);
}
