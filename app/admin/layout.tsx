import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";
import { resolveActiveOrganizationId } from "@/lib/org-access";
import { PlatformAdminHeader } from "@/components/platform-admin-header";

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?redirect=/admin");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const organizationId = await resolveActiveOrganizationId(session);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <PlatformAdminHeader
        name={session.user.name}
        email={session.user.email}
        hasOrgAccess={!!organizationId}
      />
      <main className="min-h-0 flex-1 overflow-auto bg-background">
        <div className="min-h-full p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
