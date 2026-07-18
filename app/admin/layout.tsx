import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";
import { NavBar } from "@/components/nav-bar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?redirect=/admin/events");
  }

  if (session.user.role !== "admin") {
    redirect("/events");
  }

  return (
    <div className="min-h-screen">
      <NavBar
        title="Backoffice"
        href="/admin/events"
        email={session.user.email}
        role={session.user.role ?? "staff"}
      />
      <nav className="flex gap-4 border-b px-4 py-2 text-sm">
        <Link href="/admin/events" className="hover:underline">
          Evenementen
        </Link>
        <Link href="/admin/users" className="hover:underline">
          Gebruikers
        </Link>
      </nav>
      <main className="p-4">{children}</main>
    </div>
  );
}
