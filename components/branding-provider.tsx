"use client";

import { createContext, useContext } from "react";

export type Branding = {
  platformName: string;
  logoInitial: string;
  brandColor: string;
};

const BrandingContext = createContext<Branding | null>(null);

/** Platform branding (name/logo-letter/color, editable at /admin/settings), read once
 * server-side in the root layout and made available to client components via context —
 * same pattern as ThemeProvider/NextIntlClientProvider right next to it, so nothing has to
 * be threaded as props through every nested layout (/events, /org, /admin, sign-in). */
export function BrandingProvider({ branding, children }: { branding: Branding; children: React.ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  const branding = useContext(BrandingContext);
  if (!branding) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return branding;
}
