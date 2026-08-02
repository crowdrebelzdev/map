import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getServerSession();
  if (!session) {
    const t = await getTranslations("actionErrors");
    throw new Error(t("notSignedIn"));
  }
  return session;
}
