import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { TriangleAlert } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { BrandingProvider } from "@/components/branding-provider";
import { getPlatformSettings } from "@/lib/platform-settings";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { platformName } = await getPlatformSettings();
  return {
    title: platformName,
    description: "Kaart, grid en POI-beheer voor evenementen",
    manifest: "/manifest.json",
  };
}

export const viewport = {
  themeColor: "#2563eb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, settings] = await Promise.all([getLocale(), getPlatformSettings()]);
  const { platformName, logoInitial, brandColor, maintenanceMode, maintenanceMessage } = settings;

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <BrandingProvider branding={{ platformName, logoInitial, brandColor }}>
              {maintenanceMode && (
                <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
                  <TriangleAlert className="size-4 shrink-0" />
                  {maintenanceMessage || "Er is momenteel onderhoud bezig."}
                </div>
              )}
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
            </BrandingProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
