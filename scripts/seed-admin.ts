import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] ?? "Admin";

  if (!email || !password) {
    console.error(
      "Gebruik: npx tsx scripts/seed-admin.ts <email> <wachtwoord> [naam]",
    );
    process.exit(1);
  }

  await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(user).set({ role: "admin" }).where(eq(user.email, email));

  console.log(`Admin-account aangemaakt: ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
