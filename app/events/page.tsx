import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { event, eventMember } from "@/db/schema";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, requireActiveOrganizationId } from "@/lib/org-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function StaffEventsPage() {
  const session = await getServerSession();
  // The parent layout no longer requires a session (it also serves the public map route) —
  // this page itself still does, since it lists events by team membership.
  if (!session) {
    redirect("/sign-in?redirect=/events");
  }
  const { organizationId } = await requireActiveOrganizationId();
  const isAdmin = session ? await isOrgAdmin(session, organizationId) : false;

  const events = isAdmin
    ? await db.query.event.findMany({
        where: and(eq(event.organizationId, organizationId), isNull(event.archivedAt)),
        orderBy: (event, { desc }) => desc(event.createdAt),
      })
    : await db
        .select({ id: event.id, name: event.name, slug: event.slug, createdAt: event.createdAt })
        .from(event)
        .innerJoin(eventMember, eq(eventMember.eventId, event.id))
        .where(
          and(
            eq(eventMember.userId, session!.user.id),
            eq(event.organizationId, organizationId),
            isNull(event.archivedAt),
          ),
        )
        .orderBy(desc(event.createdAt));

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <h1 className="text-lg font-semibold">Kies een evenement</h1>
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">Nog geen evenementen beschikbaar.</p>
      )}
      {events.map((e) => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle className="text-base">{e.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/events/${e.slug}/map`} className={buttonVariants({ className: "w-full" })}>
              Open kaart
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
