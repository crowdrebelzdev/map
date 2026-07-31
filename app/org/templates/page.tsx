import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/get-session";
import { isOrgAdmin, requireActiveOrganizationId } from "@/lib/org-access";
import { listTemplatesWithCategories } from "@/actions/event-templates";
import { TemplateManager } from "@/components/template-manager";

export default async function TemplatesPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in?redirect=/org/templates");
  }
  const { organizationId } = await requireActiveOrganizationId();
  if (!(await isOrgAdmin(session, organizationId))) {
    redirect("/org/events");
  }

  const templates = await listTemplatesWithCategories();

  return <TemplateManager templates={templates} />;
}
