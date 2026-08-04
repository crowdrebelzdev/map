import { getTranslations } from "next-intl/server";
import { getUser, listUserOrganizations } from "@/actions/users";
import { ROLE_LABELS } from "@/lib/auth-roles";
import { SetPlatformRoleButton } from "@/components/set-platform-role-button";
import { BanUserButton } from "@/components/ban-user-button";
import { EditUserForm } from "@/components/edit-user-form";
import { SetUserPasswordButton } from "@/components/set-user-password-button";
import { DeleteUserButton } from "@/components/delete-user-button";
import { UserOrganizationsTable } from "@/components/user-organizations-table";
import { UserCreatedAt } from "@/components/user-created-at";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [t, { userId }] = await Promise.all([getTranslations("platformUserDetail"), params]);

  const [user, organizations] = await Promise.all([getUser(userId), listUserOrganizations(userId)]);
  const isPlatformAdmin = user.role === "admin";
  const banned = !!user.banned;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">{user.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={isPlatformAdmin ? "default" : "secondary"}>
              {isPlatformAdmin ? ROLE_LABELS.admin : ROLE_LABELS.user}
            </Badge>
            {banned && <Badge variant="destructive">{t("banned")}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <EditUserForm userId={user.id} currentName={user.name} currentEmail={user.email} />
          <SetUserPasswordButton userId={user.id} userName={user.name} />
          <SetPlatformRoleButton userId={user.id} userName={user.name} isPlatformAdmin={isPlatformAdmin} />
          <BanUserButton userId={user.id} userName={user.name} banned={banned} />
          <DeleteUserButton userId={user.id} userName={user.name} />
          {banned && user.banReason && (
            <p className="w-full text-sm text-muted-foreground">{t("banReason", { reason: user.banReason })}</p>
          )}
          <UserCreatedAt createdAt={user.createdAt} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("organizations", { count: organizations.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          <UserOrganizationsTable organizations={organizations} />
        </CardContent>
      </Card>
    </div>
  );
}
