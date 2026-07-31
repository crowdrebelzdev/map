"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { count, desc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireActiveOrganizationId, requireOrgAdmin, requirePlatformAdmin } from "@/lib/org-access";

const PLATFORM_PAGE_SIZE = 15;

/** `role` here is the org-scoped role ("owner" = org admin, "member" = regular team member) —
 * this flow never grants the platform-wide super-admin role, so an org admin can never use it
 * to escalate someone (including themselves) beyond their own organization. */
export async function createUserInOrg(input: {
  name: string;
  email: string;
  password: string;
  role: "member" | "owner";
}) {
  const { session, organizationId } = await requireActiveOrganizationId();
  await requireOrgAdmin(organizationId, session);
  const requestHeaders = await headers();

  const { user: created } = await auth.api.createUser({
    headers: requestHeaders,
    body: { name: input.name, email: input.email, password: input.password, role: "user" },
  });

  await auth.api.addMember({
    headers: requestHeaders,
    body: { organizationId, userId: created.id, role: input.role },
  });

  revalidatePath("/org/users");
  return created;
}

/** All users platform-wide, regardless of organization — for `/admin/users`. */
export async function listAllUsers({ page = 1 }: { page?: number } = {}) {
  await requirePlatformAdmin();

  const offset = (Math.max(1, page) - 1) * PLATFORM_PAGE_SIZE;

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(user),
    db.query.user.findMany({
      orderBy: desc(user.createdAt),
      limit: PLATFORM_PAGE_SIZE,
      offset,
    }),
  ]);

  return { users: rows, total, totalPages: Math.max(1, Math.ceil(total / PLATFORM_PAGE_SIZE)) };
}

/** Grants/revokes the platform-wide super-admin role. Refuses to let a platform admin
 * demote themselves — the only way back in at that point would be direct database access. */
export async function setPlatformRole(userId: string, role: "admin" | "user") {
  const session = await requirePlatformAdmin();
  if (userId === session.user.id && role !== "admin") {
    throw new Error("Je kunt je eigen platformbeheerder-rol niet verwijderen.");
  }

  await auth.api.setRole({
    headers: await headers(),
    body: { userId, role },
  });

  revalidatePath("/admin/users");
}

export async function banUser(userId: string, reason?: string) {
  const session = await requirePlatformAdmin();
  if (userId === session.user.id) {
    throw new Error("Je kunt jezelf niet bannen.");
  }

  await auth.api.banUser({
    headers: await headers(),
    body: { userId, banReason: reason?.trim() || undefined },
  });

  revalidatePath("/admin/users");
}

export async function unbanUser(userId: string) {
  await requirePlatformAdmin();

  await auth.api.unbanUser({
    headers: await headers(),
    body: { userId },
  });

  revalidatePath("/admin/users");
}
