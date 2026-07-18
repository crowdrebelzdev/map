import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { event } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ev = await db.query.event.findFirst({ where: eq(event.id, eventId) });

  if (!ev) notFound();

  const tabs = [
    { href: `/admin/events/${eventId}/map`, label: "Kaart & Grid" },
    { href: `/admin/events/${eventId}/pois`, label: "POI's" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/admin/events" className="text-sm text-muted-foreground hover:underline">
            ← Alle evenementen
          </Link>
          <h1 className="text-xl font-semibold">{ev.name}</h1>
        </div>
        <Link
          href={`/events/${eventId}/map`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Live kaart bekijken ↗
        </Link>
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-t-md px-3 py-2 text-sm hover:bg-muted"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
