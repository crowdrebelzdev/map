import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

// "staff" carries no admin permissions — same shape as better-auth's default "user" role.
export const staffRole = ac.newRole({ ...userAc.statements });
export const adminRole = ac.newRole({ ...adminAc.statements });

export const authRoles = { admin: adminRole, staff: staffRole };
