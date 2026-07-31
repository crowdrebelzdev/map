"use server";

import { cookies } from "next/headers";
import { localeCookieName, locales, type Locale } from "@/i18n/request";

export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
}
