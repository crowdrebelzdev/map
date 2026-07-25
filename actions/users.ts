"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireActiveOrganizationId, requireOrgAdmin } from "@/lib/org-access";

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

  revalidatePath("/admin/users");
  return created;
}
