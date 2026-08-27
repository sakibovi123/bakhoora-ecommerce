import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the server's actual dependency graph into .next/standalone, so the
  // runtime image carries that instead of the whole node_modules tree. Without
  // it a Next image ships ~1.5GB of dev dependencies it never loads.
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
