import { getOrganization, listOrganizationMembers, listOrganizationEvents } from "@/actions/organizations";
import { RenameOrganizationForm } from "@/components/rename-organization-form";
import { OrganizationMembersTable } from "@/components/organization-members-table";
import { OrganizationEventsTable } from "@/components/organization-events-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  const [org, members, events] = await Promise.all([
    getOrganization(organizationId),
    listOrganizationMembers(organizationId),
    listOrganizationEvents(organizationId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          <p className="text-sm text-muted-foreground">{org.slug}</p>
        </div>
        <RenameOrganizationForm organizationId={org.id} currentName={org.name} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leden ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationMembersTable organizationId={org.id} members={members} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evenementen ({events.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationEventsTable events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
