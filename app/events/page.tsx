import Link from "next/link";
import { db } from "@/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function StaffEventsPage() {
  const events = await db.query.event.findMany({
    orderBy: (event, { desc }) => desc(event.createdAt),
  });

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <h1 className="text-lg font-semibold">Kies een evenement</h1>
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">Nog geen evenementen beschikbaar.</p>
      )}
      {events.map((e) => (
        <Card key={e.id}>
          <CardHeader>
            <CardTitle className="text-base">{e.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/events/${e.id}/map`} className={buttonVariants({ className: "w-full" })}>
              Open kaart
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
