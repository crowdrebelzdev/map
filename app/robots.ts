import type { MetadataRoute } from "next";

/** Keeps besloten routes (admin, org-beheer, auth-flows, API) out of search-index crawlers.
 * /events blijft toegankelijk — sommige evenementen zijn bewust publiek
 * (defaultEventAccessMode: public_anonymous/public_named, zie lib/platform-settings.ts). Geen
 * sitemap: de content is dynamisch/per-organisatie en grotendeels niet-publiek. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/org", "/api", "/sign-in", "/forgot-password", "/reset-password"],
    },
  };
}
