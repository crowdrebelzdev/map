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
  revalidatePath("/admin/templates");
}

/** Standalone template management (`/admin/templates`) — lets an org admin build up a
 * reusable category set from scratch, instead of the only other path (`saveEventAsTemplate`)
 * which requires first building out a whole real event to snapshot from. */
export async function createEmptyTemplate(name: string) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Naam is verplicht.");
  }

  const [template] = await db.insert(eventTemplate).values({ organizationId, name: trimmedName }).returning();

  revalidatePath("/admin/templates");
  return template;
}

async function requireOwnedTemplate(templateId: string, organizationId: string) {
  const template = await db.query.eventTemplate.findFirst({
    where: and(eq(eventTemplate.id, templateId), eq(eventTemplate.organizationId, organizationId)),
  });
  if (!template) {
    throw new Error("Sjabloon niet gevonden.");
  }
  return template;
}

export async function listTemplatesWithCategories() {
  const { organizationId } = await requireActiveOrganizationId();

  const templates = await db.query.eventTemplate.findMany({
    where: eq(eventTemplate.organizationId, organizationId),
    orderBy: desc(eventTemplate.createdAt),
  });

  const categoriesByTemplate = new Map<string, (typeof eventTemplateCategory.$inferSelect)[]>();
  await Promise.all(
    templates.map(async (t) => {
      const categories = await db.query.eventTemplateCategory.findMany({
        where: eq(eventTemplateCategory.templateId, t.id),
        orderBy: asc(eventTemplateCategory.sortOrder),
      });
      categoriesByTemplate.set(t.id, categories);
    }),
  );

  return templates.map((t) => ({ ...t, categories: categoriesByTemplate.get(t.id) ?? [] }));
}

export async function addTemplateCategory(
  templateId: string,
  input: { key: string; label: string; color: string },
) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);
  await requireOwnedTemplate(templateId, organizationId);

  const label = input.label.trim();
  const key = input.key.trim();
  if (!label || !key) {
    throw new Error("Naam en key zijn verplicht.");
  }

  const existing = await db.query.eventTemplateCategory.findMany({
    where: eq(eventTemplateCategory.templateId, templateId),
  });

  await db.insert(eventTemplateCategory).values({
    templateId,
    key,
    label,
    color: input.color,
    sortOrder: existing.length,
  });

  revalidatePath("/admin/templates");
}

export async function updateTemplateCategory(
  templateId: string,
  categoryId: string,
  input: { label: string; color: string },
) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);
  await requireOwnedTemplate(templateId, organizationId);

  const label = input.label.trim();
  if (!label) {
    throw new Error("Naam is verplicht.");
  }

  await db
    .update(eventTemplateCategory)
    .set({ label, color: input.color })
    .where(and(eq(eventTemplateCategory.id, categoryId), eq(eventTemplateCategory.templateId, templateId)));

  revalidatePath("/admin/templates");
}

export async function deleteTemplateCategory(templateId: string, categoryId: string) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);
  await requireOwnedTemplate(templateId, organizationId);

  await db
    .delete(eventTemplateCategory)
    .where(and(eq(eventTemplateCategory.id, categoryId), eq(eventTemplateCategory.templateId, templateId)));

  revalidatePath("/admin/templates");
}
