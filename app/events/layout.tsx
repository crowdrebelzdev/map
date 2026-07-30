import { getServerSession } from "@/lib/get-session";
import { NavBar } from "@/components/nav-bar";
import { HeaderSlotProvider } from "@/components/header-slot";

/** Not session-gated here (unlike the /admin layout) — `/events/[eventSlug]/map` is reachable
 * by anonymous/public visitors when an event's `publicAccessMode` allows it (see that page's
 * own access logic). Only the staff chrome (NavBar/logout) requires a session; pages under
 * this layout that DO need a session (e.g. `/events` itself) check for one individually. */
export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <HeaderSlotProvider>
        <NavBar
          title="Kaart"
          href="/events"
          email={session.user.email}
          role={session.user.role ?? "user"}
        />
        <main className="min-h-0 flex-1">{children}</main>
      </HeaderSlotProvider>
    </div>
  );
}
