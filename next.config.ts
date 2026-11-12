import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Document uploads go through server actions; the default limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
