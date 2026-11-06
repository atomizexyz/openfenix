"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { ThemeProvider, useTheme } from "next-themes";
import { config } from "@/lib/wagmi";
import { restoreWallet, setWalletTheme } from "@/lib/wallet";
import { useEffect, useState, type ReactNode } from "react";

/** Theme changes do not trigger a wallet SDK download. */
function WalletRuntime() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setWalletTheme(resolvedTheme === "light" ? "light" : "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    // Only returning wallet users need connection restoration on page load.
    void restoreWallet().catch(() => {
      // Connect remains available to retry if an SDK chunk failed to load.
    });
  }, []);

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
      <WalletRuntime />
      <WagmiProvider config={config} reconnectOnMount={false}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
