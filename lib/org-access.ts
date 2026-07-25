import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { event, member } from "@/db/schema";
import { requireSession } from "@/lib/get-session";
import type { getServerSession } from "@/lib/get-session";

type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;

/** The organization plugin stores the active org on the session, but a session created
 * before a user had any membership (or via the seed script) may not have it set — fall
 * back to the user's first/only membership so every caller gets a usable id. */
export async function resolveActiveOrganizationId(session: Session): Promise<string | null> {
  const active = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  if (active) return active;

  const membership = await db.query.member.findFirst({ where: eq(member.userId, session.user.id) });
  return membership?.organizationId ?? null;
}

export async function requireActiveOrganizationId(): Promise<{ session: Session; organizationId: string }> {
  const session = await requireSession();
  const organizationId = await resolveActiveOrganizationId(session);
  if (!organizationId) {
    throw new Error("Geen organisatie gevonden voor dit account.");
  }
  return { session, organizationId };
}

/** Two admin tiers: a platform-wide "super admin" (`user.role === "admin"`, Better Auth's
 * global admin plugin role) with unrestricted access everywhere, and an org-scoped
 * "org admin" (`member.role === "owner"`) with full admin rights but only within the
 * organization they belong to. This is what keeps a super admin's reach intentionally
 * platform-wide while stopping an org admin from touching another organization's data. */
export async function isOrgAdmin(session: Session, organizationId: string): Promise<boolean> {
  if (session.user.role === "admin") return true;
  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, session.user.id), eq(member.organizationId, organizationId)),
  });
  return membership?.role === "owner";
}

/** Server Action guard — throws unless the caller is a super admin or an org admin (owner) of `organizationId`. */
export async function requireOrgAdmin(
  organizationId: string,
  session?: Session,
): Promise<Session> {
  const s = session ?? (await requireSession());
  if (!(await isOrgAdmin(s, organizationId))) {
    throw new Error("Niet toegestaan: alleen voor organisatiebeheerders.");
  }
  return s;
}

/** Same guard, for actions that only receive an eventId — resolves the event's
 * organization first so an org admin's reach stays scoped to their own org. */
export async function requireOrgAdminForEvent(eventId: string, session?: Session): Promise<Session> {
  const ev = await db.query.event.findFirst({
    where: eq(event.id, eventId),
    columns: { organizationId: true },
  });
  if (!ev) {
    throw new Error("Evenement niet gevonden.");
  }
  return requireOrgAdmin(ev.organizationId, session);
}

/** Same guard, for actions that manage another user (sessions, membership) — allowed if the
 * caller is a super admin, or an org admin of any organization the target user also belongs to. */
export async function requireOrgAdminForUser(targetUserId: string, session?: Session): Promise<Session> {
  const s = session ?? (await requireSession());
  if (s.user.role === "admin") return s;

  const [callerOwnerOrgs, targetOrgs] = await Promise.all([
    db.query.member.findMany({
      where: and(eq(member.userId, s.user.id), eq(member.role, "owner")),
      columns: { organizationId: true },
    }),
    db.query.member.findMany({
      where: eq(member.userId, targetUserId),
      columns: { organizationId: true },
    }),
  ]);
  const targetOrgIds = new Set(targetOrgs.map((m) => m.organizationId));
  const sharesOrg = callerOwnerOrgs.some((m) => targetOrgIds.has(m.organizationId));
  if (!sharesOrg) {
    throw new Error("Niet toegestaan: alleen voor organisatiebeheerders.");
  }
  return s;
}
