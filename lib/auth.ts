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

// TEMP DEBUG — remove once the Amplify env var issue is confirmed/fixed.
console.log(
  "[auth debug] BETTER_AUTH_SECRET present:",
  Boolean(process.env.BETTER_AUTH_SECRET),
  "| BETTER_AUTH_URL:",
  process.env.BETTER_AUTH_URL,
  "| DATABASE_URL present:",
  Boolean(process.env.DATABASE_URL),
  "| all env keys:",
  Object.keys(process.env).sort().join(","),
);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
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
