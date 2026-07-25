import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Niet ingelogd.");
  }
  return session;
}
