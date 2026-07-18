import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, authRoles } from "@/lib/auth-roles";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: authRoles })],
});

export const { signIn, signOut, useSession } = authClient;
