import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
    // proxy.ts reads the request body (same-origin check on mutations) before it
    // reaches the server action, so it has its own body-size cap — separate from
    // serverActions.bodySizeLimit above. Keep both in sync with the 20MB upload
    // limit enforced in lib/storage.ts.
    middlewareClientMaxBodySize: "25mb",
  },
  // Allows loading the dev server (HMR) from a LAN IP, e.g. when testing GPS on a phone
  // via `next dev --experimental-https`. Update this if your LAN IP changes.
  allowedDevOrigins: ["192.168.100.60", "172.20.10.2"],
};

export default nextConfig;
