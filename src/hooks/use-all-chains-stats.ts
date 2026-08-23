"use client";

import { useReadContracts } from "wagmi";
import { FENIX_ABI } from "@/config/abi";
import { FENIX_CHAINS, type FenixChainConfig } from "@/config/chains";
import { GENERATED_RPC_ENDPOINTS } from "@/config/rpc-endpoints.generated";

export interface ChainStats {
  chainConfig: FenixChainConfig;
  totalSupply: bigint | undefined;
  equityPoolSupply: bigint | undefined;
  rewardPoolSupply: bigint | undefined;
  shareRate: bigint | undefined;
  /**
   * `unavailable` is decided at build time from the RPC scan, not from a failed
   * request: the chain is deployed and listed, but no endpoint answers reads for
   * it, so there is nothing to wait for and a skeleton would never resolve.
   */
  status: "success" | "error" | "loading" | "unavailable";
}

const FUNCTIONS = [
  "totalSupply",
  "equityPoolSupply",
  "rewardPoolSupply",
  "shareRate",
] as const;

/**
 * Whether the RPC scan found any endpoint that answers reads for a chain.
 *
 * Evmos (9001) and Dogechain (2000) are deployed and deliberately left enabled
 * -- the contracts are still onchain and a connected wallet can still write --
 * but every public endpoint is dead, so the generated file lists none. Known at
 * build time; no runtime probing.
 */
function hasReachableRpc(chainId: number): boolean {
  return (GENERATED_RPC_ENDPOINTS[chainId]?.http.length ?? 0) > 0;
}

// Every deployment the dashboard lists.
const listedChains = FENIX_CHAINS.filter((chainConfig) => chainConfig.enabled);

// ...of those, the ones an RPC will actually answer for. A chain with no
// reachable endpoint parks the whole batch behind a request that can never
// resolve, which is why every card sat in a skeleton, not just its own.
const readableChains = listedChains.filter((chainConfig) =>
  hasReachableRpc(chainConfig.chain.id)
);

// Build all contract calls for every readable chain upfront, so wagmi can
// coalesce them into one Multicall3 call per chain.
const allContracts = readableChains.flatMap((chainConfig) =>
  FUNCTIONS.map((functionName) => ({
    address: chainConfig.fenixContract,
    abi: FENIX_ABI,
    functionName,
    chainId: chainConfig.chain.id,
  }))
);

// Chain id -> index of its first result in `data`. Keyed by chain rather than by
// position in the render list: the two lists differ in length, so a positional
// index would make every chain after the first unreachable one read another
// chain's numbers.
const RESULT_OFFSETS = new Map(
  readableChains.map((chainConfig, i) => [
    chainConfig.chain.id,
    i * FUNCTIONS.length,
  ])
);

export function useAllChainsStats() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: allContracts,
    query: {
      refetchInterval: 30_000,
    },
  });

  const chainsStats: ChainStats[] = listedChains.map((chainConfig) => {
    const empty = {
      chainConfig,
      totalSupply: undefined,
      equityPoolSupply: undefined,
      rewardPoolSupply: undefined,
      shareRate: undefined,
    };

    const offset = RESULT_OFFSETS.get(chainConfig.chain.id);
    if (offset === undefined) {
      return { ...empty, status: "unavailable" as const };
    }

    if (!data) {
      return { ...empty, status: "loading" as const };
    }

    const results = FUNCTIONS.map((_, j) => data[offset + j]);
    const hasError = results.some((r) => r?.status === "failure");

    return {
      chainConfig,
      totalSupply: results[0]?.result as bigint | undefined,
      equityPoolSupply: results[1]?.result as bigint | undefined,
      rewardPoolSupply: results[2]?.result as bigint | undefined,
      shareRate: results[3]?.result as bigint | undefined,
      status: hasError ? ("error" as const) : ("success" as const),
    };
  });

  return { chainsStats, isLoading, refetch };
}
