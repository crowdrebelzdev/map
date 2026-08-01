"use server";

import { revalidatePath } from "next/cache";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  areaCategory,
  event,
  eventDay,
  eventMap,
  eventTemplate,
  eventTemplateCategory,
  gridConfig,
  mapArea,
  organization,
  poi,
  poiCategory,
  publicAccessModeValues,
  type PublicAccessMode,
} from "@/db/schema";
import {
  requireActiveOrganizationId,
  requireOrgAdmin,
  requireOrgAdminForEvent,
  requirePlatformAdmin,
} from "@/lib/org-access";
import { copyMapImage, deleteMapImage, deleteMapTiles } from "@/lib/storage";
import { logActivity } from "@/lib/activity-log";
import { getPlatformSettings } from "@/lib/platform-settings";

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

  const { defaultEventAccessMode } = await getPlatformSettings();

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
    const [ev] = await tx
      .insert(event)
      .values({ name, slug, organizationId, publicAccessMode: defaultEventAccessMode })
      .returning();
    await tx.insert(poiCategory).values(categoriesToInsert.map((c) => ({ eventId: ev.id, ...c })));
    return ev;
  });

  revalidatePath("/org/events");
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

    const [sourceGrid, sourceCategories, sourcePois, sourceEventDays, sourceAreaCategories, sourceAreas, map] =
      await Promise.all([
        tx.query.gridConfig.findFirst({ where: eq(gridConfig.eventId, eventId) }),
        tx.query.poiCategory.findMany({ where: eq(poiCategory.eventId, eventId) }),
        tx.query.poi.findMany({ where: eq(poi.eventId, eventId) }),
        tx.query.eventDay.findMany({ where: eq(eventDay.eventId, eventId) }),
        tx.query.areaCategory.findMany({ where: eq(areaCategory.eventId, eventId) }),
        tx.query.mapArea.findMany({ where: eq(mapArea.eventId, eventId) }),
        tx.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) }),
      ]);

    if (sourceGrid) {
      const { id: _id, eventId: _eventId, ...gridValues } = sourceGrid;
      await tx.insert(gridConfig).values({ ...gridValues, eventId: ev.id });
    }

    const dayIdMap = new Map<string, string>();
    if (sourceEventDays.length > 0) {
      const insertedDays = await tx
        .insert(eventDay)
        .values(sourceEventDays.map((d) => ({ eventId: ev.id, date: d.date, label: d.label })))
        .returning();
      sourceEventDays.forEach((d, i) => dayIdMap.set(d.id, insertedDays[i].id));
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
            icon: c.icon,
            shape: c.shape,
            extraFields: c.extraFields,
            autoNumberEnabled: c.autoNumberEnabled,
            autoNumberPrefix: c.autoNumberPrefix,
            autoNumberSuffix: c.autoNumberSuffix,
            autoNumberNext: c.autoNumberNext,
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
            eventDayId: p.eventDayId ? (dayIdMap.get(p.eventDayId) ?? null) : null,
            name: p.name,
            description: p.description,
            icon: p.icon,
            fillColor: p.fillColor,
            borderColor: p.borderColor,
            owner: p.owner,
            size: p.size,
            startTime: p.startTime,
            endTime: p.endTime,
            extraFieldValues: p.extraFieldValues,
            pixelX: p.pixelX,
            pixelY: p.pixelY,
            lat: p.lat,
            lng: p.lng,
          })),
        );
      }
    }

    if (sourceAreaCategories.length > 0) {
      const areaCategoryIdMap = new Map<string, string>();
      const insertedAreaCategories = await tx
        .insert(areaCategory)
        .values(
          sourceAreaCategories.map((c) => ({
            eventId: ev.id,
            key: c.key,
            label: c.label,
            color: c.color,
            extraFields: c.extraFields,
            sortOrder: c.sortOrder,
          })),
        )
        .returning();
      sourceAreaCategories.forEach((c, i) => areaCategoryIdMap.set(c.id, insertedAreaCategories[i].id));

      if (sourceAreas.length > 0) {
        await tx.insert(mapArea).values(
          sourceAreas.map((a) => ({
            eventId: ev.id,
            categoryId: areaCategoryIdMap.get(a.categoryId)!,
            name: a.name,
            vertices: a.vertices,
            extraFieldValues: a.extraFieldValues,
          })),
        );
      }
    }

    return { created: ev, sourceMap: map };
  });

  if (sourceMap) {
    try {
      const imageUrl = await copyMapImage(eventId, created.id, sourceMap.imageUrl);
      // Deliberately not copying the source map's tile set (see eventMap.tileVersion):
      // tile keys are namespaced by eventId (uploads/tiles/{eventId}/{versionId}/...), so
      // copying just the version id here without also copying every tile object in S3 would
      // point the new event at tiles that don't exist under its own prefix — worse than no
      // tiles. Leaving tileVersion unset makes the duplicated event fall back to rendering
      // `imageUrl` directly, exactly like any map that hasn't been tiled yet; an admin
      // re-saving the (already-correct, copied) placement on the new event regenerates tiles
      // for it same as any other placement save.
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

  revalidatePath("/org/events");
  return created;
}

export async function archiveEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);
  await db.update(event).set({ archivedAt: new Date() }).where(eq(event.id, eventId));
  revalidatePath("/org/events");
  revalidatePath("/org");
  revalidatePath("/events");
}

export async function unarchiveEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);
  await db.update(event).set({ archivedAt: null }).where(eq(event.id, eventId));
  revalidatePath("/org/events");
  revalidatePath("/org");
  revalidatePath("/events");
}

export async function updatePublicAccessMode(eventId: string, eventSlug: string, mode: PublicAccessMode) {
  const session = await requireOrgAdminForEvent(eventId);
  if (!publicAccessModeValues.includes(mode)) {
    throw new Error("Ongeldig toegangsniveau.");
  }

  await db.update(event).set({ publicAccessMode: mode }).where(eq(event.id, eventId));

  logActivity(eventId, session.user.id, "event.public_access_mode_update", `${session.user.name} heeft het publieke toegangsniveau gewijzigd.`);

  revalidatePath(`/org/events/${eventSlug}/settings`);
  revalidatePath(`/events/${eventSlug}/map`);
}

export async function deleteEvent(eventId: string) {
  await requireOrgAdminForEvent(eventId);

  const map = await db.query.eventMap.findFirst({ where: eq(eventMap.eventId, eventId) });
  if (map) {
    await deleteMapImage(eventId, map.imageUrl).catch(() => {
      // Best-effort: an orphaned file in storage shouldn't block deleting the event.
    });
    if (map.tileVersion) {
      await deleteMapTiles(eventId, map.tileVersion).catch(() => {
        // Best-effort, same reasoning — an orphaned tile set costs storage, not correctness.
      });
    }
  }

  await db.delete(event).where(eq(event.id, eventId));
  revalidatePath("/org/events");
}

const PLATFORM_EVENTS_PAGE_SIZE = 15;

/** All events platform-wide, regardless of organization — for `/admin/events`. Each row
 * links straight into the existing full event admin at `/org/events/[slug]/...`, which
 * already accepts a platform admin regardless of organization membership (see
 * `lib/org-access.ts`'s `isOrgAdmin`) — no separate event-management UI needed here. */
export async function listAllEvents({ page = 1 }: { page?: number } = {}) {
  await requirePlatformAdmin();

  const offset = (Math.max(1, page) - 1) * PLATFORM_EVENTS_PAGE_SIZE;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(event),
    db
      .select({
        id: event.id,
        name: event.name,
        slug: event.slug,
        createdAt: event.createdAt,
        archivedAt: event.archivedAt,
        organizationId: organization.id,
        organizationName: organization.name,
      })
      .from(event)
      .innerJoin(organization, eq(organization.id, event.organizationId))
      .orderBy(desc(event.createdAt))
      .limit(PLATFORM_EVENTS_PAGE_SIZE)
      .offset(offset),
  ]);

  return { events: rows, total, totalPages: Math.max(1, Math.ceil(total / PLATFORM_EVENTS_PAGE_SIZE)) };
}
