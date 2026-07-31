import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// `/events/[eventSlug]/map` is reachable by anonymous visitors when the event's
// `publicAccessMode` allows it — that page (and its layout) do their own DB-backed access
// check, since this proxy has no DB access and can't know an event's mode. Everything else
// under /events (and all of /admin and /org) still requires a session at this layer.
const PUBLIC_MAP_PATTERN = /^\/events\/[^/]+\/map\/?$/;
// The per-event PWA manifest (app/events/[eventSlug]/manifest.ts) has to be fetchable by the
// browser without a session cookie — an anonymous visitor's browser requests it directly when
// resolving the <link rel="manifest">, it can't carry the redirect-to-sign-in through that.
// Just event name + brand color, same exposure level as any other public static asset.
const PUBLIC_MANIFEST_PATTERN = /^\/events\/[^/]+\/manifest\.webmanifest$/;

export function proxy(request: NextRequest) {
  if (PUBLIC_MAP_PATTERN.test(request.nextUrl.pathname) || PUBLIC_MANIFEST_PATTERN.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/org/:path*", "/events/:path*"],
};
