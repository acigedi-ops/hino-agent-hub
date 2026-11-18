import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Document uploads go through server actions; the default limit is 1 MB.
  // Turns iPhone HEIC pictures into JPG on the server; loaded as it is, not bundled.
  serverExternalPackages: ["heic-convert"],
  experimental: { serverActions: { bodySizeLimit: "28mb" } },
};

export default nextConfig;
