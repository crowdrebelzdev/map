import { eq } from "drizzle-orm";
import { db } from "@/db";
import { event, member, organization, user } from "@/db/schema";

const DEFAULT_ORG_NAME = "Crowdrebelz";
const DEFAULT_ORG_SLUG = "crowdrebelz";

function generateId() {
  return crypto.randomUUID().replace(/-/g, "");
}

async function main() {
  let org = await db.query.organization.findFirst({ where: eq(organization.slug, DEFAULT_ORG_SLUG) });
  if (!org) {
    [org] = await db
      .insert(organization)
      .values({ id: generateId(), name: DEFAULT_ORG_NAME, slug: DEFAULT_ORG_SLUG })
      .returning();
    console.log(`Organisatie "${DEFAULT_ORG_NAME}" aangemaakt.`);
  } else {
    console.log(`Organisatie "${DEFAULT_ORG_NAME}" bestond al.`);
  }

  const events = await db.query.event.findMany();
  let assigned = 0;
  for (const ev of events) {
    if (ev.organizationId) continue;
    await db.update(event).set({ organizationId: org.id }).where(eq(event.id, ev.id));
    assigned++;
  }
  console.log(`${assigned} evenement(en) toegewezen aan "${DEFAULT_ORG_NAME}".`);

  const users = await db.query.user.findMany();
  let membersAdded = 0;
  for (const u of users) {
    const existing = await db.query.member.findFirst({
      where: (m, { and, eq }) => and(eq(m.organizationId, org!.id), eq(m.userId, u.id)),
    });
    if (existing) continue;
    const orgRole = u.role === "admin" ? "owner" : "member";
    await db.insert(member).values({
      id: generateId(),
      organizationId: org.id,
      userId: u.id,
      role: orgRole,
    });
    membersAdded++;
  }
  console.log(`${membersAdded} gebruiker(s) toegevoegd als lid van "${DEFAULT_ORG_NAME}".`);

  console.log("Backfill voltooid.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
