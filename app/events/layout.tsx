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
    <div className="min-h-screen">
      <NavBar
        title="Kaart"
        href="/events"
        email={session.user.email}
        role={session.user.role ?? "staff"}
      />
      <main>{children}</main>
    </div>
  );
}
