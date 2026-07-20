import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";
import { NavBar } from "@/components/nav-bar";

export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?redirect=/events");
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <NavBar
        title="Kaart"
        href="/events"
        email={session.user.email}
        role={session.user.role ?? "staff"}
      />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
