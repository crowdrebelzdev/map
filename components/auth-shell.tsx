import { MapPin } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-foreground lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div
          className="absolute inset-0 text-background opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex flex-col items-center gap-4 px-8 text-background">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-background/10">
            <MapPin className="size-8" />
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold">Eventkaart</p>
            <p className="mt-1 text-sm text-background/60">
              Kaart, grid en POI-beheer voor evenementen
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
