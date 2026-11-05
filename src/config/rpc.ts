import { smartHyperevm } from "@bloxwap/smart-hyperevm/transport";
import { http } from "viem";
import type { Transport } from "viem";
import { GENERATED_RPC_ENDPOINTS } from "./rpc-endpoints.generated";
import { FENIX_CHAINS } from "./chains";

/**
 * JSON-RPC methods that broadcast a signed transaction. These are the only ones
 * that can be sandwiched, so they are the only ones routed through MEV
 * protection; everything else uses the public read transport.
 */
export const WRITE_METHODS = [
  "eth_sendRawTransaction",
  "eth_sendPrivateTransaction",
] as const;

/**
 * BlinkLabs MEV-protected endpoints, by chain id. Blink bundles a transaction
 * with searcher backruns so it cannot be frontrun or unbundled, and refunds
 * recovered value to the sender.
 *
 * To cover another chain, add its subdomain here -- nothing else needs to
 * change. Blink also serves Arbitrum (42161) and Solana, neither of which has a
 * FENIX deployment today.
 *
 * @see https://docs.blinklabs.xyz/blink/get-started/mev
 */
export const BLINK_HOSTS: Record<number, string> = {
  1: "eth",
  56: "bsc",
  8453: "base",
};

/**
 * Public by necessity: the browser makes these calls directly, so the key ships
 * in the client bundle and is visible to anyone using the site. Scope it to the
 * site's origin in the Blink portal and treat it as a rate-limit token, not a
 * secret.
 */
const BLINK_API_KEY = process.env.NEXT_PUBLIC_BLINK_API_KEY;

function blinkUrl(chainId: number): string | undefined {
  const host = BLINK_HOSTS[chainId];
  if (!host || !BLINK_API_KEY) return undefined;
  return `https://${host}.blinklabs.xyz/v1/${BLINK_API_KEY}`;
}

/** Whether writes on this chain are MEV-protected in the current build. */
export function hasMevProtection(chainId: number): boolean {
  return blinkUrl(chainId) !== undefined;
}

/**
 * Falls back to viem's chain defaults when the scan found no usable endpoints,
 * so a chain whose scanned RPCs are unavailable still gets a valid transport.
 */
function readUrls(chainId: number): string[] {
  const chain = FENIX_CHAINS.find((c) => c.chain.id === chainId)?.chain;
  if (!chain) throw new Error(`No RPC config for chain ${chainId}`);
  const generated = GENERATED_RPC_ENDPOINTS[chainId]?.http ?? [];
  if (generated.length > 0) return generated;
  return [...chain.rpcUrls.default.http];
}

/**
 * Adaptive RPC routing with the default 10s attempt budget. Caching and
 * latest-block pinning stay off to preserve vanilla reads on reorg-capable
 * chains. Background head probes are disabled so large multi-chain registries
 * do not create an N-endpoint request storm; scoring uses actual calls and
 * heads observed during normal traffic.
 */
export function createChainTransport(chainId: number): Transport {
  const readTransportUrls = readUrls(chainId);
  const mevUrl = blinkUrl(chainId);
  const config = GENERATED_RPC_ENDPOINTS[chainId];

  // Batch only when the scan confirmed support at every kept endpoint.
  const batch = config?.batch ? ({ wait: 16 } as const) : false;

  const endpoints = mevUrl
    ? [
        http(mevUrl, { methods: { include: [...WRITE_METHODS] } }),
        ...readTransportUrls.map((url) =>
          http(url, {
            batch,
            // Method routing prevents public fallback for protected writes.
            methods: { exclude: [...WRITE_METHODS] },
          }),
        ),
      ]
    : readTransportUrls;

  return smartHyperevm({
    endpoints,
    batch: mevUrl ? undefined : batch,
    cache: false,
    pinLatest: false,
    headLag: { probeInterval: false },
    // Private writes never use read retry/racing; raw writes may rebroadcast.
    nonIdempotentMethods: WRITE_METHODS,
    rebroadcastRawTransactions: true,
  });
}

export const chainTransports: Record<number, Transport> = Object.fromEntries(
  FENIX_CHAINS.filter((c) => c.enabled).map(({ chain }) => [
    chain.id,
    createChainTransport(chain.id),
  ]),
);
