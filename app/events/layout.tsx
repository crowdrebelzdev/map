import { getServerSession } from "@/lib/get-session";
import { NavBar } from "@/components/nav-bar";
import { HeaderSlotProvider } from "@/components/header-slot";
import { getPlatformSettings } from "@/lib/platform-settings";

/** Not session-gated here (unlike the /admin or /org layouts) — `/events/[eventSlug]/map` is reachable
 * by anonymous/public visitors when an event's `publicAccessMode` allows it (see that page's
 * own access logic). Only the staff chrome (NavBar/logout) requires a session; pages under
 * this layout that DO need a session (e.g. `/events` itself) check for one individually. */
export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, { platformName }] = await Promise.all([getServerSession(), getPlatformSettings()]);

  if (!session) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    // `--navbar-height` lets a deeply nested page (e.g. the operational map's
    // viewport-`fixed` overlay buttons — see operational-map.tsx) account for NavBar's
    // height without needing to know about NavBar directly: `fixed` positioning ignores
    // normal document flow, so those overlays would otherwise sit at the true top of the
    // browser viewport and get covered by NavBar, even though `<main>` itself is correctly
    // confined below it. NavBar's own rendered height is 3.5rem (py-3 padding + the size-8
    // avatar) — the value below adds a bit of breathing room on top of that on purpose, not
    // just an exact measurement. Only set here (not in the `!session` branch above), so an
    // anonymous visitor without NavBar sees no change at all — those overlays' own
    // safe-area-aware gap already handles that case correctly on its own.
    <div className="flex h-dvh flex-col overflow-hidden" style={{ "--navbar-height": "4.25rem" } as React.CSSProperties}>
      <HeaderSlotProvider>
        <NavBar
          title={platformName}
          href="/events"
          email={session.user.email}
          role={session.user.role ?? "user"}
        />
        <main className="min-h-0 flex-1">{children}</main>
      </HeaderSlotProvider>
    </div>
  );
}
