import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, resolveActiveOrganizationId } from "@/lib/org-access";

export default async function Home() {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in");
  }

  if (session.user.role === "admin") {
    redirect("/admin");
  }

  const organizationId = await resolveActiveOrganizationId(session);
  const canManageOrg = organizationId ? await isOrgAdmin(session, organizationId) : false;
  redirect(canManageOrg ? "/admin" : "/events");
}
