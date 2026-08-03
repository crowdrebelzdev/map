import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// `/events/[eventSlug]/map` is reachable by anonymous visitors when the event's
// `publicAccessMode` allows it — that page (and its layout) do their own DB-backed access
// check, since this proxy has no DB access and can't know an event's mode. Its manifest
// (used for "Add to Home Screen", see manifest.webmanifest/route.ts) needs the same
// exemption: a browser fetches it directly, unauthenticated, while rendering that page, and
// only exposes the event's name — same as the page itself. Everything else under /events
// (and all of /admin and /org) still requires a session at this layer.
const PUBLIC_MAP_PATTERN = /^\/events\/[^/]+\/map(\/manifest\.webmanifest)?\/?$/;

export function proxy(request: NextRequest) {
  if (PUBLIC_MAP_PATTERN.test(request.nextUrl.pathname)) {
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
