import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventMember, member, user } from "@/db/schema";
import { requireEventBySlug } from "@/lib/get-event";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin } from "@/lib/org-access";
import { EventTeamEditor } from "@/components/event-team-editor";

export default async function EventTeamPage({
  params,
}: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await params;
  const ev = await requireEventBySlug(eventSlug);
  const session = await getServerSession();

  if (!session || !(await isOrgAdmin(session, ev.organizationId))) {
    redirect("/org/events");
  }

  const [memberRows, orgUsers] = await Promise.all([
    db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        permissions: eventMember.permissions,
      })
      .from(eventMember)
      .innerJoin(user, eq(user.id, eventMember.userId))
      .where(eq(eventMember.eventId, ev.id)),
    // Candidates are limited to this event's own organization — a "user" role member
    // there, never an owner/admin (they already bypass eventMember permissions entirely).
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, ev.organizationId), eq(member.role, "member"))),
  ]);

  const memberUserIds = new Set(memberRows.map((m) => m.userId));
  const candidates = orgUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <EventTeamEditor
      eventId={ev.id}
      eventSlug={eventSlug}
      members={memberRows}
      candidates={candidates}
    />
  );
}
