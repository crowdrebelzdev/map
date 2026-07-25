"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { event, eventTemplate, eventTemplateCategory, poiCategory } from "@/db/schema";
import { requireActiveOrganizationId, requireOrgAdmin, requireOrgAdminForEvent } from "@/lib/org-access";

/** Snapshots an event's current POI categories into a named, reusable template — the
 * grid/map placement stays out of scope on purpose, since corners are always specific to
 * a venue's uploaded image and would need to be redrawn on a new event regardless. */
export async function saveEventAsTemplate(eventId: string, name: string) {
  await requireOrgAdminForEvent(eventId);

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Naam is verplicht.");
  }

  const ev = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { organizationId: true },
  });
  if (!ev) {
    throw new Error("Evenement niet gevonden.");
  }

  const categories = await db.query.poiCategory.findMany({
    where: eq(poiCategory.eventId, eventId),
    orderBy: asc(poiCategory.sortOrder),
  });

  await db.transaction(async (tx) => {
    const [template] = await tx
      .insert(eventTemplate)
      .values({ organizationId: ev.organizationId, name: trimmedName })
      .returning();

    if (categories.length > 0) {
      await tx.insert(eventTemplateCategory).values(
        categories.map((c) => ({
          templateId: template.id,
          key: c.key,
          label: c.label,
          color: c.color,
          sortOrder: c.sortOrder,
        })),
      );
    }
  });

  revalidatePath("/admin/events");
}

export async function listEventTemplates() {
  const { organizationId } = await requireActiveOrganizationId();
  return db.query.eventTemplate.findMany({
    where: eq(eventTemplate.organizationId, organizationId),
    orderBy: desc(eventTemplate.createdAt),
  });
}

export async function deleteEventTemplate(templateId: string) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);

  await db
    .delete(eventTemplate)
    .where(and(eq(eventTemplate.id, templateId), eq(eventTemplate.organizationId, organizationId)));

  revalidatePath("/admin/events");
}
