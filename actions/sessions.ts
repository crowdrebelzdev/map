"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auth } from "@/lib/auth";
import { session as sessionTable } from "@/db/schema";
import { requireOrgAdminForUser } from "@/lib/org-access";

export async function listUserSessions(userId: string) {
  await requireOrgAdminForUser(userId);
  const { sessions } = await auth.api.listUserSessions({
    headers: await headers(),
    body: { userId },
  });
  return sessions
    .filter((s) => s.expiresAt > new Date())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeUserSession(sessionToken: string) {
  const target = await db.query.session.findFirst({
    where: eq(sessionTable.token, sessionToken),
    columns: { userId: true },
  });
  if (!target) {
    throw new Error("Sessie niet gevonden.");
  }
  await requireOrgAdminForUser(target.userId);
  await auth.api.revokeUserSession({ headers: await headers(), body: { sessionToken } });
}

export async function revokeAllUserSessions(userId: string) {
  await requireOrgAdminForUser(userId);
  await auth.api.revokeUserSessions({ headers: await headers(), body: { userId } });
}
