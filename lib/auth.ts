import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { db } from "@/db";
import { ac, authRoles } from "@/lib/auth-roles";
import { sendEmail } from "@/lib/email";
import { wrapBrandedEmail } from "@/lib/email-template";
import { getPlatformSettings } from "@/lib/platform-settings";

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
      const settings = await getPlatformSettings();
      await sendEmail({
        to: user.email,
        subject: "Wachtwoord resetten",
        html: wrapBrandedEmail(
          settings,
          `
            <p>Hoi ${user.name},</p>
            <p>Klik op onderstaande link om een nieuw wachtwoord in te stellen. Deze link is een uur geldig.</p>
            <p><a href="${url}">Wachtwoord resetten</a></p>
            <p>Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.</p>
          `,
        ),
      });
    },
  },
  // Staff shouldn't have to sign in every day on their own phone. "Onthoud mij" at
  // sign-in (rememberMe, on by default) uses this 30-day persistent session;
  // unchecking it falls back to a session-only cookie that clears on browser close.
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Staff on the operational map poll 4 separate server actions every 8-20s, each of
    // which calls getServerSession() — without this, that's a DB round trip per poll per
    // person. A signed cookie cache answers most of those from the request itself instead.
    // Trade-off: a role/permission change can take up to maxAge to take effect for someone
    // already signed in — acceptable for this app's scale.
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
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
    // Amplify's compute sits behind at least one extra proxy hop, so `x-forwarded-for`
    // arrives as more than one address. Without a known `trustedProxies` CIDR for that
    // hop, Better Auth can't safely pick the real client IP out of the chain (confirmed
    // in prod logs: "falling back to a single shared per-path bucket") — so every sign-in
    // attempt from every visitor currently shares ONE counter. The default there is 3
    // attempts per 10s, which a handful of crew signing in around the same time would
    // trip for everyone. Raised only for sign-in, since that's the one staff actually hit
    // around event start; still throttles a real brute-force loop, just not at "3 people
    // signing in within 10s of each other".
    customRules: {
      "/sign-in/email": { window: 10, max: 20 },
    },
  },
  plugins: [
    admin({
      ac,
      roles: authRoles,
      defaultRole: "user",
    }),
    // Multi-tenancy: an "organization" represents one client/company. Org creation is
    // restricted by default (no self-serve signup, so new orgs are normally a deliberate
    // decision, not a user action) — but platform admins can flip this on/off at runtime
    // via /admin/settings, hence the function instead of a static `false`.
    organization({
      allowUserToCreateOrganization: async () => (await getPlatformSettings()).allowOrgSelfRegistration,
      creatorRole: "owner",
    }),
  ],
});
