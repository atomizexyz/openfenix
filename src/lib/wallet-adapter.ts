import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { config, networks, projectId } from "./wagmi";

/**
 * AppKit normally adds a public Reown RPC fallback to every transport. Reuse
 * the existing config verbatim so protected writes can never bypass Blink,
 * and so lazy wallet initialization preserves all readers and connections.
 * The adapter installs its watchers later, during AppKit's construct().
 */
class StrictTransportWagmiAdapter extends WagmiAdapter {
  constructor() {
    super({
      networks,
      projectId,
      transports: config._internal.transports,
      batch: { multicall: { wait: 16 } },
      ssr: true,
    });
    this.wagmiConfig = config;
  }
}

export const wagmiAdapter = new StrictTransportWagmiAdapter();
