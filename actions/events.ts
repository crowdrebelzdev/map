"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { event, eventMap, eventTemplate, eventTemplateCategory, gridConfig, poi, poiCategory } from "@/db/schema";
import { requireActiveOrganizationId, requireOrgAdmin, requireOrgAdminForEvent } from "@/lib/org-access";
import { copyMapImage, deleteMapImage } from "@/lib/storage";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const DEFAULT_POI_CATEGORIES = [
  { key: "security", label: "Beveiliging", color: "#dc2626" },
  { key: "medical", label: "EHBO", color: "#16a34a" },
  { key: "toilet", label: "Toiletten", color: "#2563eb" },
  { key: "stage", label: "Podium", color: "#9333ea" },
  { key: "other", label: "Overig", color: "#64748b" },
] as const;

export async function createEvent(formData: FormData) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Naam is verplicht.");
  }
  const templateId = String(formData.get("templateId") ?? "").trim() || null;

  let slug = slugify(name);
  const existing = await db.query.event.findFirst({
    where: eq(event.slug, slug),
  });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  let categoriesToInsert: { key: string; label: string; color: string; sortOrder: number }[] =
    DEFAULT_POI_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i }));

  if (templateId) {
    const template = await db.query.eventTemplate.findFirst({ where: eq(eventTemplate.id, templateId) });
    if (!template || template.organizationId !== organizationId) {
      throw new Error("Ongeldig sjabloon.");
    }
    const templateCategories = await db.query.eventTemplateCategory.findMany({
      where: eq(eventTemplateCategory.templateId, templateId),
      orderBy: asc(eventTemplateCategory.sortOrder),
    });
    if (templateCategories.length > 0) {
      categoriesToInsert = templateCategories.map((c) => ({
        key: c.key,
        label: c.label,
        color: c.color,
        sortOrder: c.sortOrder,
      }));
    }
  }

  const created = await db.transaction(async (tx) => {
    const [ev] = await tx.insert(event).values({ name, slug, organizationId }).returning();
    await tx.insert(poiCategory).values(categoriesToInsert.map((c) => ({ eventId: ev.id, ...c })));
    return ev;
  });

  revalidatePath("/admin/events");
  return created;
}

export async function duplicateEvent(eventId: string) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);

  const source = await db.query.event.findFirst({ where: eq(event.id, eventId) });
  if (!source || source.organizationId !== organizationId) {
    throw new Error("Evenement niet gevonden.");
  }

  let slug = `${source.slug}-kopie`;
  const existing = await db.query.event.findFirst({ where: eq(event.slug, slug) });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const { created, sourceMap } = await db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(event)
      .values({ name: `${source.name} (kopie)`, slug, organizationId })
      .returning();

    const [sourceGrid, sourceCategories, sourcePois, map] = await Promise.all([
      tx.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, eventId) }),
      tx.query.poiCategory.findMany({ where: eq(poiCategory.eventId, eventId) }),
      tx.query.poi.findMany({ where: eq(poi.eventId, eventId) }),
      tx.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) }),
    ]);

    if (sourceGrid) {
      const { id: _id, eventId: _eventId, ...gridValues } = sourceGrid;
      await tx.insert(gridConfig).values({ ...gridValues, eventId: ev.id });
    }

    if (sourceCategories.length > 0) {
      const categoryIdMap = new Map<string, string>();
      const insertedCategories = await tx
        .insert(poiCategory)
        .values(
          sourceCategories.map((c) => ({
            eventId: ev.id,
            key: c.key,
            label: c.label,
            color: c.color,
            sortOrder: c.sortOrder,
          })),
        )
        .returning();
      sourceCategories.forEach((c, i) => categoryIdMap.set(c.id, insertedCategories[i].id));

      if (sourcePois.length > 0) {
        await tx.insert(poi).values(
          sourcePois.map((p) => ({
            eventId: ev.id,
            categoryId: categoryIdMap.get(p.categoryId)!,
            name: p.name,
            description: p.description,
            pixelX: p.pixelX,
            pixelY: p.pixelY,
            lat: p.lat,
            lng: p.lng,
          })),
        );
      }
    }

    return { created: ev, sourceMap: map };
  });

  if (sourceMap) {
    try {
      const imageUrl = await copyMapImage(eventId, created.id, sourceMap.imageUrl);
      await db.insert(eventMap).values({
        eventId: created.id,
        imageUrl,
        imageWidth: sourceMap.imageWidth,
        imageHeight: sourceMap.imageHeight,
        cornerTlLat: sourceMap.cornerTlLat,
        cornerTlLng: sourceMap.cornerTlLng,
        cornerTrLat: sourceMap.cornerTrLat,
        cornerTrLng: sourceMap.cornerTrLng,
        cornerBrLat: sourceMap.cornerBrLat,
        cornerBrLng: sourceMap.cornerBrLng,
        cornerBlLat: sourceMap.cornerBlLat,
        cornerBlLng: sourceMap.cornerBlLng,
      });
    } catch {
      // Best-effort: the duplicated event still works without a copied map image;
      // the admin can just re-upload it on the new event.
    }
  }

  revalidatePath("/admin/events");
  return created;
}

export async function archiveEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);
  await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, eventId));
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/events");
}

export async function unarchiveEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);
  await db.update(event).set({ archivedAt: null }).where(eq(event.id, eventId));
  revalidatePath("/admin/events");
  revalidatePath("/admin");
  revalidatePath("/events");
}

export async function deleteEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);

  const map = await db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) });
  if (map) {
    await deleteMapImage(eventId, map.imageUrl).catch(() => {
      // Best-effort: an orphaned file in storage shouldn't block deleting the event.
    });
  }

  await db.delete(event).where(eq(event.id, eventId));
  revalidatePath("/admin/events");
}
