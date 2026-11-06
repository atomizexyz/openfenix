import { createConfig, type Transport } from "wagmi";
import type { Chain } from "viem";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { SUPPORTED_CHAINS } from "@/config/chains";
import { chainTransports } from "@/config/rpc";

export const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo";

/** viem chains are AppKit networks as-is; the tuple type is what AppKit wants. */
export const networks = SUPPORTED_CHAINS as unknown as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

const transports: Record<number, Transport> = Object.fromEntries(
  SUPPORTED_CHAINS.map((chain) => [chain.id, chainTransports[chain.id]]),
);

// Reading chain data never needs the wallet dialog or its SDK. Keep this
// singleton independent so AppKit can attach to it only when a wallet is used.
export const config = createConfig({
  chains: SUPPORTED_CHAINS as [Chain, ...Chain[]],
  transports,
  batch: { multicall: { wait: 16 } },
  ssr: true,
});
