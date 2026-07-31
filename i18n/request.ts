import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["nl", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "nl";
export const localeCookieName = "locale";

function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

// No [locale] URL segment (see components/locale-toggle.tsx for why) — the locale comes
// from a cookie instead, read here so both server and client rendering agree on it.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = isLocale(cookieStore.get(localeCookieName)?.value)
    ? (cookieStore.get(localeCookieName)!.value as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
