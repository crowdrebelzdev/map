import { eq, and, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { event, poiCategory, user, eventMember, eventMemberPermissionValues } from "@/db/schema";

const DEFAULT_POI_CATEGORIES = [
  { key: "security", label: "Beveiliging", color: "#dc2626" },
  { key: "medical", label: "EHBO", color: "#16a34a" },
  { key: "toilet", label: "Toiletten", color: "#2563eb" },
  { key: "stage", label: "Podium", color: "#9333ea" },
  { key: "other", label: "Overig", color: "#64748b" },
] as const;

async function main() {
  // 1. Seed default categories for every event that doesn't have any yet.
  const events = await db.query.event.findMany();
  for (const ev of events) {
    const existing = await db.query.poiCategory.findFirst({ where: eq(poiCategory.eventId, ev.id) });
    if (existing) continue;
    await db.insert(poiCategory).values(
      DEFAULT_POI_CATEGORIES.map((c, i) => ({ eventId: ev.id, ...c, sortOrder: i })),
    );
    console.log(`Categorieën aangemaakt voor evenement "${ev.name}"`);
  }

  // Step 2 (backfilling poi.categoryId from the old poi.category text column) ran once,
  // here, before `poi.category` was dropped from the schema — kept out now since the
  // source column no longer exists to type-check against.

  // 3. Rename the old "staff" role value (and any null) to "user".
  const roleUpdate = await db
    .update(user)
    .set({ role: "user" })
    .where(or(isNull(user.role), eq(user.role, "staff")))
    .returning({ id: user.id });
  console.log(`${roleUpdate.length} gebruiker(s) van rol "staff"/null naar "user" gezet.`);

  // 4. Grant existing non-admin users full permissions on every existing event, so nobody
  // loses access they already had the moment this ships.
  const nonAdminUsers = await db.query.user.findMany({ where: eq(user.role, "user") });
  let grants = 0;
  for (const u of nonAdminUsers) {
    for (const ev of events) {
      const existingMember = await db.query.eventMember.findFirst({
        where: and(eq(eventMember.eventId, ev.id), eq(eventMember.userId, u.id)),
      });
      if (existingMember) continue;
      await db.insert(eventMember).values({
        eventId: ev.id,
        userId: u.id,
        permissions: [...eventMemberPermissionValues],
      });
      grants++;
    }
  }
  console.log(`${grants} event-lidmaatschap(pen) aangemaakt voor bestaande gebruikers.`);

  console.log("Backfill voltooid.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
