import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { db } from "@/db";
import { ac, authRoles } from "@/lib/auth-roles";
import { sendEmail } from "@/lib/email";

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
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Wachtwoord resetten",
        html: `
          <p>Hoi ${user.name},</p>
          <p>Klik op onderstaande link om een nieuw wachtwoord in te stellen. Deze link is een uur geldig.</p>
          <p><a href="${url}">Wachtwoord resetten</a></p>
          <p>Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</p>
        `,
      });
    },
  },
  // Staff shouldn't have to sign in every day on their own phone. "Onthoud mij" at
  // sign-in (rememberMe, on by default) uses this 30-day persistent session;
  // unchecking it falls back to a session-only cookie that clears on browser close.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: ["http://localhost:3000", "https://localhost:3000", ...extraTrustedOrigins],
  // Better Auth's built-in limiter already throttles /sign-in, /sign-up and
  // /forget-password sensibly by default — the only thing that needed changing is where
  // the counters live. Left on "memory" (the default), each serverless/Lambda instance
  // this app runs on (see the comment in lib/storage.ts) would keep its own counter, so a
  // brute-force attempt spread across instances would barely be throttled at all.
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  plugins: [
    admin({
      ac,
      roles: authRoles,
      defaultRole: "user",
    }),
    // Multi-tenancy: an "organization" represents one client/company. Org creation is
    // deliberately restricted — this app has no self-serve signup, so new orgs only ever
    // come from a deliberate decision (a new client), not a user action.
    organization({
      allowUserToCreateOrganization: false,
      creatorRole: "owner",
    }),
  ],
});
