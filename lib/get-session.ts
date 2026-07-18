import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireAdminSession() {
  const session = await getServerSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("Niet toegestaan: alleen voor admins.");
  }
  return session;
}

export async function requireSession() {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Niet ingelogd.");
  }
  return session;
}
