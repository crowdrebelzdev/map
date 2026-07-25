import Link from "next/link";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { event, eventMember } from "@/db/schema";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, requireActiveOrganizationId } from "@/lib/org-access";
import { listEventTemplates } from "@/actions/event-templates";
import { CreateEventForm } from "@/components/create-event-form";
import { EventsTable } from "@/components/events-table";
import { PaginationControls } from "@/components/pagination-controls";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 15;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; archived?: string }>;
}) {
  const { page: pageParam, archived: archivedParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const showArchived = archivedParam === "1";

  const session = await getServerSession();
  const { organizationId } = await requireActiveOrganizationId();
  const isAdmin = session ? await isOrgAdmin(session, organizationId) : false;
  const templates = isAdmin ? await listEventTemplates() : [];

  const orgFilter = and(
    isAdmin
      ? eq(event.organizationId, organizationId)
      : and(eq(eventMember.userId, session!.user.id), eq(event.organizationId, organizationId)),
    showArchived ? undefined : isNull(event.archivedAt),
  );

  const [[{ total }], events] = await Promise.all([
    isAdmin
      ? db.select({ total: count() }).from(event).where(orgFilter)
      : db.select({ total: count() }).from(event).innerJoin(eventMember, eq(eventMember.eventId, event.id)).where(orgFilter),
    isAdmin
      ? db.query.event.findMany({
          where: orgFilter,
          orderBy: (event, { desc }) => desc(event.createdAt),
          limit: PAGE_SIZE,
          offset,
        })
      : db
          .select({
            id: event.id,
            name: event.name,
            slug: event.slug,
            createdAt: event.createdAt,
            archivedAt: event.archivedAt,
          })
          .from(event)
          .innerJoin(eventMember, eq(eventMember.eventId, event.id))
          .where(orgFilter)
          .orderBy(desc(event.createdAt))
          .limit(PAGE_SIZE)
          .offset(offset),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Evenementen ({total})</CardTitle>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/events?archived=${showArchived ? "0" : "1"}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {showArchived ? "Verberg gearchiveerd" : "Toon gearchiveerd"}
          </Link>
          {isAdmin && <CreateEventForm templates={templates} />}
        </div>
      </CardHeader>
      <CardContent>
        <EventsTable events={events} isAdmin={isAdmin} />
        <PaginationControls
          page={page}
          totalPages={totalPages}
          basePath={showArchived ? "/admin/events?archived=1" : "/admin/events"}
        />
      </CardContent>
    </Card>
  );
}
