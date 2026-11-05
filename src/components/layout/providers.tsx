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

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchInterval: 15_000,
            retry: 2,
            retryDelay: 1_000,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppKitThemeSync />
      <WagmiProvider config={config} reconnectOnMount>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
