import { createConfig, type Transport } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
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

interface StrictAdapterParams {
  networks: [AppKitNetwork, ...AppKitNetwork[]];
  projectId: string;
  transports: Record<number, Transport>;
  batch: { multicall: { wait: number } };
  ssr: boolean;
}

/**
 * AppKit's adapter wraps every transport it is given as
 * `fallback([ours, http(rpc.walletconnect.org)])`. That trailing endpoint
 * carries every method, so on a chain with Blink MEV protection a Blink outage
 * would fall through and broadcast `eth_sendRawTransaction` publicly -- the
 * exact downgrade `createChainTransport` exists to prevent.
 *
 * Rebuild the (public) wagmi config with our transports verbatim once the base
 * constructor has resolved the chains. Nothing reads the discarded config: the
 * adapter only wires watchers onto `wagmiConfig` later, in `construct()`.
 * Locked by src/__tests__/wagmi-config.test.ts.
 */
class StrictTransportWagmiAdapter extends WagmiAdapter {
  constructor(params: StrictAdapterParams) {
    super(params);
    this.wagmiConfig = createConfig({
      chains: this.wagmiChains!,
      transports: params.transports,
      batch: params.batch,
      ssr: params.ssr,
    });
  }
}

export const wagmiAdapter = new StrictTransportWagmiAdapter({
  networks,
  projectId,
  transports,
  // Coalesce concurrent reads into one Multicall3 call per chain. The
  // dashboard fans out across every live chain at once, so this collapses
  // dozens of round-trips into one per chain.
  batch: { multicall: { wait: 16 } },
  // The build prerenders every page, so wagmi must restore persisted state
  // after mount rather than during render. Storage stays on wagmi's default
  // (localStorage) now that there is no server to read cookies.
  ssr: true,
});

export const config = wagmiAdapter.wagmiConfig;
