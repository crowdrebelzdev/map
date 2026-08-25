import { readFile } from "fs/promises";
import path from "path";

type BrandIconInput = {
  logoUrl: string | null;
  logoInitial: string;
  brandColor: string;
};

/** Resolves a possibly-relative logoUrl (local dev without S3, e.g.
 * "/uploads/platform/logo-x.png") into something Satori/ImageResponse can render — it needs
 * either an absolute URL or raw image data, not a relative path. An S3 logoUrl is already
 * absolute and passes through unchanged. */
async function resolveLogoSrc(logoUrl: string): Promise<string> {
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return logoUrl;
  }

  const filePath = path.join(process.cwd(), "public", logoUrl);
  const buffer = await readFile(filePath);
  const ext = path.extname(logoUrl).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "jpeg" : ext;
  return `data:image/${mime};base64,${buffer.toString("base64")}`;
}

/** The square brand-icon JSX shared by app/icon.tsx, app/manifest-icon/route.tsx and
 * app/opengraph-image.tsx — a real logo when one's been uploaded (/admin/settings),
 * otherwise the same letter-in-circle fallback all three used to render individually.
 * `fontSize` only applies to the fallback and should scale with the container this is
 * rendered into (roughly 55% of its pixel size reads well). */
export async function brandIconElement({ logoUrl, logoInitial, brandColor }: BrandIconInput, fontSize: number) {
  if (logoUrl) {
    const src = await resolveLogoSrc(logoUrl);
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori/ImageResponse renders its own <img>, not the DOM */}
        <img src={src} alt="" width="100%" height="100%" style={{ objectFit: "contain" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brandColor,
        color: "#fff",
        fontSize,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      {logoInitial}
    </div>
  );
}
