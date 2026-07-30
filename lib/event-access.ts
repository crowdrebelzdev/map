import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { event, eventMember, member as memberTable, type EventMemberPermission } from "@/db/schema";
import { requireSession } from "@/lib/get-session";

export type EventAccess =
  | { isAdmin: true; isMember: true; permissions: "all" }
  | { isAdmin: false; isMember: boolean; permissions: EventMemberPermission[] };

/** Super admins (`user.role === "admin"`, platform-wide) and org admins (`member.role ===
 * "owner"` of the event's own organization) bypass entirely; everyone else's access is
 * exactly what their `eventMember` row for this event says. `isMember` (row exists, even
 * with zero permissions) is what grants baseline operational-map access — kept distinct
 * from `permissions.length > 0`. */
export async function getEventAccess(
  eventId: string,
  actor: { id: string; role: string | null },
): Promise<EventAccess> {
  if (actor.role === "admin") return { isAdmin: true, isMember: true, permissions: "all" };

  const ev = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { organizationId: true },
  });
  if (ev) {
    const orgMembership = await db.query.member.findFirst({
      where: and(eq(memberTable.userId, actor.id), eq(memberTable.organizationId, ev.organizationId)),
    });
    if (orgMembership?.role === "owner") {
      return { isAdmin: true, isMember: true, permissions: "all" };
    }
  }

  const member = await db.query.eventMember.findFirst({
    where: and(eq(eventMember.eventId, eventId), eq(eventMember.userId, actor.id)),
  });
  return { isAdmin: false, isMember: !!member, permissions: member?.permissions ?? [] };
}

export function hasAnyEventAccess(access: EventAccess) {
  return access.isAdmin || access.isMember;
}

export function hasEventPermission(access: EventAccess, permission: EventMemberPermission) {
  return access.isAdmin || access.permissions.includes(permission);
}

/** Server Action guard, for use inside actions/*.ts. */
export async function requireEventPermission(eventId: string, permission: EventMemberPermission) {
  const session = await requireSession();
  const access = await getEventAccess(eventId, { id: session.user.id, role: session.user.role ?? null });
  if (!hasEventPermission(access, permission)) {
    throw new Error("Niet toegestaan voor dit evenement.");
  }
  return { session, access };
}

/** Shared tab list for the event admin sub-nav — used both by the normal breadcrumb/tabs
 * chrome and by the fullscreen map/POI pages' own slim header, so the two stay in sync. */
export function buildEventTabs(eventSlug: string, access: EventAccess) {
  return [
    { href: `/admin/events/${eventSlug}`, label: "Overzicht" },
    hasEventPermission(access, "edit_map") && {
      href: `/admin/events/${eventSlug}/map`,
      label: "Kaart & Grid",
    },
    (hasEventPermission(access, "manage_pois") || hasEventPermission(access, "manage_categories")) && {
      href: `/admin/events/${eventSlug}/pois`,
      label: "POI's & Categorieën",
    },
    (hasEventPermission(access, "view_live_locations") || hasEventPermission(access, "manage_incidents")) && {
      href: `/admin/events/${eventSlug}/live`,
      label: "Live locaties",
    },
    access.isAdmin && { href: `/admin/events/${eventSlug}/team`, label: "Team" },
    access.isAdmin && { href: `/admin/events/${eventSlug}/activity`, label: "Activiteit" },
    access.isAdmin && { href: `/admin/events/${eventSlug}/settings`, label: "Instellingen" },
  ].filter((t): t is { href: string; label: string } => !!t);
}

/** Looser variant of requireEventPermission for actions with no specific permission,
 * just baseline operational-map access (e.g. logging a search on the live map). */
export async function requireAnyEventAccess(eventId: string) {
  const session = await requireSession();
  const access = await getEventAccess(eventId, { id: session.user.id, role: session.user.role ?? null });
  if (!hasAnyEventAccess(access)) {
    throw new Error("Niet toegestaan voor dit evenement.");
  }
  return { session, access };
}
