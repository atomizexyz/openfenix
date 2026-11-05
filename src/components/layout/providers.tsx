"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { createAppKit, useAppKitTheme } from "@reown/appkit/react";
import { mainnet } from "@reown/appkit/networks";
import { ThemeProvider, useTheme } from "next-themes";
import { config, networks, projectId, wagmiAdapter } from "@/lib/wagmi";
import { useEffect, useState, type ReactNode } from "react";

// Module scope, once: AppKit is a singleton that the hooks below read from.
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: mainnet,
  metadata: {
    name: "Fenix Protocol",
    description: "Burn XEN, Stake FENIX, Earn Trustless Yield",
    url: "https://fenix.fyi",
    icons: ["https://fenix.fyi/images/fenix-logo.svg"],
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#f97316",
    // The site's own face. It also keeps AppKit from fetching its default
    // font from fonts.reown.com, which the CSP's font-src does not allow.
    "--w3m-font-family": "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  },
  features: {
    // Wallet connection only: no embedded email/social wallets, and none of
    // AppKit's swap/on-ramp/send flows, which are not part of this app.
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
    send: false,
    receive: false,
    // No usage telemetry to Reown.
    analytics: false,
  },
  // The Coinbase and Base Account connectors need their SDKs installed as
  // wagmi optional peers; leaving them out keeps that dependency tree (and its
  // advisories) out of the bundle. Coinbase Wallet still connects through its
  // extension (EIP-6963) or WalletConnect.
  enableCoinbase: false,
  enableBaseAccount: false,
});

/** Keeps the AppKit modal on the same light/dark theme as the site. */
function AppKitThemeSync() {
  const { resolvedTheme } = useTheme();
  const { setThemeMode } = useAppKitTheme();

  useEffect(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") {
      setThemeMode(resolvedTheme);
    }
  }, [resolvedTheme, setThemeMode]);

  return null;
}

/**
 * next-themes renders its anti-flash <script> from inside this client
 * component. In the server HTML it must stay executable: it sets the theme
 * class before first paint. But whenever React creates it on the client (a
 * locale switch remounts these providers), React 19 logs "Encountered a script
 * tag while rendering React component" -- client-created scripts never run.
 * Marking the client copy as a data block skips that warning without changing
 * the server HTML. next-themes already puts suppressHydrationWarning on the
 * element, so the differing `type` is not a hydration mismatch.
 */
const THEME_SCRIPT_PROPS =
  typeof window === "undefined" ? undefined : { type: "application/json" };

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // No global refetchInterval: each read polls at a cadence matched
            // to its data (see use-fenix-contract.ts), and one that should not
            // poll -- ENS names, say -- no longer re-resolves every 15s.
            staleTime: 15_000,
            retry: 2,
            retryDelay: 1_000,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      scriptProps={THEME_SCRIPT_PROPS}
    >
      <AppKitThemeSync />
      <WagmiProvider config={config} reconnectOnMount>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
