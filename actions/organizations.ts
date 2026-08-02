"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { organization, member, event, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/org-access";

const PAGE_SIZE = 15;

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/** Platform-wide organization list — unlike everything under `/org`, this isn't scoped to
 * any single organization. Member/event counts are simple correlated subqueries rather than
 * a join+groupBy, since we also need the plain organization columns per row. */
export async function listOrganizations({ page = 1 }: { page?: number } = {}) {
  await requirePlatformAdmin();

  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(organization),
    db.query.organization.findMany({
      orderBy: desc(organization.createdAt),
      limit: PAGE_SIZE,
      offset,
    }),
  ]);

  const withCounts = await Promise.all(
    rows.map(async (org) => {
      const [[{ value: memberCount }], [{ value: eventCount }]] = await Promise.all([
        db.select({ value: count() }).from(member).where(eq(member.organizationId, org.id)),
        db.select({ value: count() }).from(event).where(eq(event.organizationId, org.id)),
      ]);
      return { ...org, memberCount, eventCount };
    }),
  );

  return { organizations: withCounts, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Self-serve organization creation is disabled (`allowUserToCreateOrganization: false` in
 * lib/auth.ts) — this is the only way a new organization gets created, deliberately gated to
 * platform admins. Calls the organization plugin's API directly, same pattern as
 * `createUserInOrg` calling `auth.api.createUser` directly. */
export async function createOrganization(input: { name: string }) {
  const session = await requirePlatformAdmin();
  const requestHeaders = await headers();

  const name = input.name.trim();
  if (!name) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("nameRequired"));
  }

  let slug = slugify(name);
  const existing = await db.query.organization.findFirst({ where: eq(organization.slug, slug) });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const created = await auth.api.createOrganization({
    headers: requestHeaders,
    body: { name, slug, userId: session.user.id },
  });

  revalidatePath("/admin/organizations");
  return created;
}

export async function getOrganization(organizationId: string) {
  await requirePlatformAdmin();

  const org = await db.query.organization.findFirst({ where: eq(organization.id, organizationId) });
  if (!org) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("organizationNotFound"));
  }
  return org;
}

export async function listOrganizationMembers(organizationId: string) {
  await requirePlatformAdmin();

  return db
    .select({ id: user.id, name: user.name, email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(member.createdAt));
}

export async function listOrganizationEvents(organizationId: string) {
  await requirePlatformAdmin();

  return db.query.event.findMany({
    where: eq(event.organizationId, organizationId),
    orderBy: desc(event.createdAt),
  });
}

/** Direct Drizzle update rather than `auth.api.updateOrganization` — that API resolves the
 * organization via the caller's own membership and checks their org-role permission, so it
 * rejects a platform admin who isn't personally a member of the target org. Slug is left
 * untouched: events have their own unique slug, not org-prefixed, so renaming has no wider
 * routing impact. */
export async function renameOrganization(organizationId: string, name: string) {
  await requirePlatformAdmin();

  const trimmed = name.trim();
  if (!trimmed) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("nameRequired"));
  }

  await db.update(organization).set({ name: trimmed }).where(eq(organization.id, organizationId));
  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/admin/organizations");
}

async function countOwners(organizationId: string, excludingUserId?: string) {
  const conditions = [eq(member.organizationId, organizationId), eq(member.role, "owner")];
  if (excludingUserId) conditions.push(ne(member.userId, excludingUserId));
  const [{ value }] = await db
    .select({ value: count() })
    .from(member)
    .where(and(...conditions));
  return value;
}

/** Same reasoning as `renameOrganization` for using a raw update instead of
 * `auth.api.updateMemberRole`. Refuses to demote the organization's last remaining owner —
 * that would leave it with no one able to manage it from the /org side. */
export async function updateOrgMemberRole(organizationId: string, userId: string, role: "owner" | "member") {
  await requirePlatformAdmin();

  if (role === "member" && (await countOwners(organizationId, userId)) === 0) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("cannotDemoteLastOrgAdmin"));
  }

  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  revalidatePath(`/admin/organizations/${organizationId}`);
}

/** Same reasoning as `renameOrganization` for using a raw delete instead of
 * `auth.api.removeMember`. Refuses to remove the organization's last remaining owner. */
export async function removeOrgMember(organizationId: string, userId: string) {
  await requirePlatformAdmin();

  const targetMember = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
  });
  if (targetMember?.role === "owner" && (await countOwners(organizationId, userId)) === 0) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("cannotRemoveLastOrgAdmin"));
  }

  await db.delete(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  revalidatePath(`/admin/organizations/${organizationId}`);
}
