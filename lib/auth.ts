import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/db";
import { ac, authRoles } from "@/lib/auth-roles";

// Extra origins to trust besides BETTER_AUTH_URL — needed when testing over the LAN
// (e.g. https://192.168.x.x:3000 for mobile GPS testing). Set TRUSTED_ORIGINS in
// .env.local as a comma-separated list; update it whenever your LAN IP changes.
const extraTrustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  // Staff shouldn't have to sign in every day on their own phone. "Onthoud mij" at
  // sign-in (rememberMe, on by default) uses this 30-day persistent session;
  // unchecking it falls back to a session-only cookie that clears on browser close.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: ["http://localhost:3000", "https://localhost:3000", ...extraTrustedOrigins],
  plugins: [
    admin({
      ac,
      roles: authRoles,
      defaultRole: "staff",
    }),
  ],
});
