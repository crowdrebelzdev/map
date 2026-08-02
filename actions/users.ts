"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { count, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { user, member, organization } from "@/db/schema";
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
    const t = await getTranslations("actionErrors");
    throw new Error(t("cannotRemoveOwnPlatformAdmin"));
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
    const t = await getTranslations("actionErrors");
    throw new Error(t("cannotBanSelf"));
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

export async function getUser(userId: string) {
  await requirePlatformAdmin();

  const found = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!found) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("userNotFound"));
  }
  return found;
}

/** Which organizations this user belongs to and with what role — for `/admin/users/[userId]`.
 * Read-only here; membership changes happen from the organization's own detail page (a
 * single place that mutates `member` rows, not two). */
export async function listUserOrganizations(userId: string) {
  await requirePlatformAdmin();

  return db
    .select({ id: organization.id, name: organization.name, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(desc(member.createdAt));
}

export async function updateUserProfile(userId: string, input: { name: string; email: string }) {
  await requirePlatformAdmin();

  const name = input.name.trim();
  const email = input.email.trim();
  const t = await getTranslations("actionErrors");
  if (!name) throw new Error(t("nameRequired"));
  if (!email) throw new Error(t("emailRequired"));

  await auth.api.adminUpdateUser({
    headers: await headers(),
    body: { userId, data: { name, email } },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setUserPasswordAdmin(userId: string, newPassword: string) {
  await requirePlatformAdmin();

  await auth.api.setUserPassword({
    headers: await headers(),
    body: { userId, newPassword },
  });
}

/** Deletes the user's account, sessions and linked accounts — cannot be undone. Better
 * Auth's own endpoint additionally refuses to let a platform admin remove themselves. */
export async function deleteUser(userId: string) {
  await requirePlatformAdmin();

  await auth.api.removeUser({
    headers: await headers(),
    body: { userId },
  });

  revalidatePath("/admin/users");
}
