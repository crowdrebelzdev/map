import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ORG_ROLE_LABELS } from "@/lib/auth-roles";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OrgRow = { id: string; name: string; slug: string; role: string };

export async function UserOrganizationsTable({ organizations }: { organizations: OrgRow[] }) {
  const [t, tc] = await Promise.all([getTranslations("userOrganizationsTable"), getTranslations("common")]);
  if (organizations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noMemberships")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("organization")}</TableHead>
          <TableHead>{tc("role")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {organizations.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="font-medium">
              <Link href={`/admin/organizations/${o.id}`} className="hover:underline">
                {o.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{ORG_ROLE_LABELS[o.role] ?? o.role}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
