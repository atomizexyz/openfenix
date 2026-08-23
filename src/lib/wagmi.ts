import { createConfig } from "wagmi";
import { getDefaultConfig } from "connectkit";
import { SUPPORTED_CHAINS } from "@/config/chains";
import { chainTransports } from "@/config/rpc";

const chains = SUPPORTED_CHAINS as unknown as readonly [
  (typeof SUPPORTED_CHAINS)[0],
  ...typeof SUPPORTED_CHAINS,
];

const transports: Record<number, (typeof chainTransports)[number]> =
  Object.fromEntries(
    SUPPORTED_CHAINS.map((chain) => [chain.id, chainTransports[chain.id]]),
  );

export const config = createConfig({
  ...getDefaultConfig({
    chains,
    transports,
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
    appName: "Fenix Protocol",
    appDescription: "Burn XEN, Stake FENIX, Earn Trustless Yield",
    appUrl: "https://fenix.fyi",
    appIcon: "https://fenix.fyi/images/fenix-logo.svg",
    // Coalesce concurrent reads into one Multicall3 call per chain. The
    // dashboard fans out across every live chain at once, so this collapses
    // dozens of round-trips into one per chain. Passed through getDefaultConfig
    // rather than alongside it so it lands on the same config branch as
    // `transports`.
    batch: { multicall: { wait: 16 } },
  }),
  // The build prerenders every page, so wagmi must restore persisted state
  // after mount rather than during render. Storage stays on wagmi's default
  // (localStorage) now that there is no server to read cookies.
  ssr: true,
});
