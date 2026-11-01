import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite builds paralelos (por ejemplo, pruebas e2e) sin pisar .next del servidor de desarrollo.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
