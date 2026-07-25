import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// "user" carries no admin-plugin permissions — same shape as better-auth's default "user"
// role. All actual capability comes from the app's own per-event `eventMember` table, not
// from this role (see lib/event-access.ts).
export const userRole = ac.newRole({ ...userAc.statements });
export const adminRole = ac.newRole({ ...adminAc.statements });

export const authRoles = { admin: adminRole, user: userRole };

// Platform-wide role (Better Auth admin plugin, `user.role`) — "admin" here is a super
// admin with unrestricted, cross-organization access. Distinct from the org-scoped role
// below; see lib/org-access.ts.
export const ROLE_LABELS: Record<string, string> = {
  admin: "Platformbeheerder",
  user: "Gebruiker",
};

// Org-scoped role (organization plugin, `member.role`) — "owner" here is an org admin,
// with full admin rights but only within that organization.
export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "Organisatiebeheerder",
  member: "Teamlid",
};
