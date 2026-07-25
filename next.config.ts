import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  // Allows loading the dev server (HMR) from a LAN IP, e.g. when testing GPS on a phone
  // via `next dev --experimental-https`. Update this if your LAN IP changes.
  allowedDevOrigins: ["192.168.100.60", "172.20.10.2"],
};

export default nextConfig;
