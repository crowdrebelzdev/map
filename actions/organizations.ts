"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organization, member, event } from "@/db/schema";
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
    throw new Error("Naam is verplicht.");
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
