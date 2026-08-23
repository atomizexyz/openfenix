import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Fully static build: `next build` emits ./out with no server runtime.
  output: "export",
  // GitHub Pages resolves /en/burn/ to /en/burn/index.html.
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, "pino-pretty": false };
    config.externals = [...(config.externals || []), "pino-pretty"];
    return config;
  },
};

export default withNextIntl(nextConfig);
