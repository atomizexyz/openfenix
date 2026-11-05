import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Fully static build: `next build` emits ./out with no server runtime.
  output: "export",
  // GitHub Pages resolves /en/burn/ to /en/burn/index.html.
  trailingSlash: true,
  images: {
    // No next/image usage in the app; unoptimized keeps the export fully static
    // and means no remotePatterns are needed at all.
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: {
      // pino (pulled in by WalletConnect) optionally requires pino-pretty, a
      // dev-only log formatter. Alias it away so it never reaches the bundle.
      "pino-pretty": false,
      // AppKit lazily imports the Coinbase Wallet and Base Account SDKs for
      // connectors that src/components/layout/providers.tsx disables
      // (enableCoinbase / enableBaseAccount). They install as optional deps of
      // @reown/appkit-utils regardless; aliasing them keeps that tree (and the
      // CDP SDK's unresolvable x402 imports) out of the bundle.
      "@coinbase/wallet-sdk": false,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
    },
  },
};

export default withNextIntl(nextConfig);
