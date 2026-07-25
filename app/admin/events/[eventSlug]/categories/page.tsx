import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { poiCategory } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { getEventAccess, hasEventPermission } from "@/lib/event-access";
import { PoiCategoryEditor } from "@/components/poi-category-editor";

export default async function EventCategoriesPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();
  const access = await getEventAccess(ev.id, { id: session!.user.id, role: session!.user.role ?? null });

  if (!hasEventPermission(access, "manage_categories")) {
    redirect("/admin/events");
  }

  const categories = await db.query.poiCategory.findMany({
    where: eq(poiCategory.eventId, ev.id),
    orderBy: asc(poiCategory.sortOrder),
  });

  return <PoiCategoryEditor eventId={ev.id} eventSlug={eventSlug} categories={categories} />;
}
