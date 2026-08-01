import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "40mb",
    },
    // proxy.ts reads the request body (same-origin check on mutations) before it
    // reaches the server action, so it has its own body-size cap — separate from
    // serverActions.bodySizeLimit above. Keep both in sync with the 40MB upload
    // limit enforced in lib/storage.ts (MAX_MAP_IMAGE_BYTES) — raised from 20MB
    // together with the map-image-editor "Hoog"/"Maximaal" quality presets, which can
    // produce a source image that large. Only verified against this Next.js config and
    // the local dev server: AWS's own infrastructure in production (Lambda/API Gateway,
    // fronting the Amplify SSR compute) may impose a lower payload limit of its own that
    // wouldn't show up here — test an upload at the "Maximaal" tier in production before
    // relying on it.
    middlewareClientMaxBodySize: "40mb",
  },
  // Allows loading the dev server (HMR) from a LAN IP, e.g. when testing GPS on a phone
  // via `next dev --experimental-https`. Update this if your LAN IP changes.
  allowedDevOrigins: ["192.168.100.60", "172.20.10.2"],
};

export default withNextIntl(nextConfig);
