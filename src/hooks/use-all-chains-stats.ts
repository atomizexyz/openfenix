"use client";

import { useReadContracts } from "wagmi";
import { FENIX_ABI } from "@/config/abi";
import { FENIX_CHAINS, type FenixChainConfig } from "@/config/chains";

export interface ChainStats {
  chainConfig: FenixChainConfig;
  totalSupply: bigint | undefined;
  equityPoolSupply: bigint | undefined;
  rewardPoolSupply: bigint | undefined;
  shareRate: bigint | undefined;
  status: "success" | "error" | "loading";
}

const FUNCTIONS = [
  "totalSupply",
  "equityPoolSupply",
  "rewardPoolSupply",
  "shareRate",
] as const;

// Only chains with a reachable RPC. Reading a disabled chain would fire
// requests at dead endpoints and render a permanently-loading card.
const activeChains = FENIX_CHAINS.filter((chainConfig) => chainConfig.enabled);

// Build all contract calls for every active chain upfront, so wagmi can
// coalesce them into one Multicall3 call per chain.
const allContracts = activeChains.flatMap((chainConfig) =>
  FUNCTIONS.map((functionName) => ({
    address: chainConfig.fenixContract,
    abi: FENIX_ABI,
    functionName,
    chainId: chainConfig.chain.id,
  }))
);

export function useAllChainsStats() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: allContracts,
    query: {
      refetchInterval: 30_000,
    },
  });

  const chainsStats: ChainStats[] = activeChains.map((chainConfig, i) => {
    const offset = i * FUNCTIONS.length;

    if (!data) {
      return {
        chainConfig,
        totalSupply: undefined,
        equityPoolSupply: undefined,
        rewardPoolSupply: undefined,
        shareRate: undefined,
        status: "loading" as const,
      };
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
