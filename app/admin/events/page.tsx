import Link from "next/link";
import { db } from "@/db";
import { createEvent } from "@/actions/events";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function EventsPage() {
  const events = await db.query.event.findMany({
    orderBy: (event, { desc }) => desc(event.createdAt),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nieuw evenement</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEvent} className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="name">Naam</Label>
              <Input id="name" name="name" placeholder="Bijv. Zomerfestival 2026" required />
            </div>
            <Button type="submit">Aanmaken</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evenementen</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen evenementen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.slug}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/events/${e.id}/map`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Beheren
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
