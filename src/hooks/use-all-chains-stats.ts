"use client";

import { useCallback, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { useConfig } from "wagmi";
// Via `wagmi/query`, not `@wagmi/core/query`: the latter is only a transitive
// dependency that happens to be hoisted, so importing it directly breaks under
// an isolated/strict node_modules layout.
import {
  readContractsQueryOptions,
  hashFn,
  structuralSharing,
} from "wagmi/query";
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

// One multicall's worth of reads for a single chain. Kept per-chain rather than
// flattened into one list because each chain gets its own query below.
function contractsFor(chainConfig: FenixChainConfig) {
  return FUNCTIONS.map((functionName) => ({
    address: chainConfig.fenixContract,
    abi: FENIX_ABI,
    functionName,
    chainId: chainConfig.chain.id,
  }));
}

export function useAllChainsStats() {
  const config = useConfig();

  // One query per chain rather than one query for all of them.
  //
  // A single useReadContracts across every chain is one React Query unit, so it
  // reports loading until the SLOWEST chain settles -- the grid rendered at the
  // max, not the median. Measured: chains answer between ~140ms and ~450ms, so
  // every card waited on the slowest one. Split like this, each row paints as
  // its own chain returns and the first numbers land roughly 3x sooner.
  //
  // wagmi's own query options are reused, so batching and the multicall path are
  // unchanged. Two things useReadContracts adds on top of those options have to
  // be re-applied by hand, because calling useQueries bypasses wagmi's useQuery
  // wrapper: `queryKeyHashFn` (react-query's default hash cannot serialize a
  // BigInt, so any future read passing bigint `args` would throw during render)
  // and `structuralSharing` (bigint-aware; the default is not).
  //
  // The cache key is deliberately NOT identical: useReadContracts folds the
  // connected wallet's chainId into the key, so switching networks refetched the
  // whole grid even though every contract here pins its own chainId. Omitting it
  // keeps these twelve entries stable across a network switch.
  const results = useQueries({
    queries: readableChains.map((chainConfig) => ({
      ...readContractsQueryOptions(config, {
        contracts: contractsFor(chainConfig),
      }),
      queryKeyHashFn: hashFn,
      structuralSharing,
      refetchInterval: 30_000,
    })),
  });

  // Chain id -> that chain's query. Keyed rather than positional: `listedChains`
  // includes chains with no reachable RPC and `readableChains` does not, so an
  // index would make every chain after the first unreachable one read another
  // chain's numbers.
  const byChainId = new Map(
    readableChains.map((chainConfig, i) => [chainConfig.chain.id, results[i]])
  );

  // Not memoised: useQueries already structurally shares its results, and
  // mapping twelve entries is cheaper than the stale-closure risk of a dep array
  // that needs a lint suppression to satisfy.
  const chainsStats: ChainStats[] = listedChains.map((chainConfig) => {
    const empty = {
      chainConfig,
      totalSupply: undefined,
      equityPoolSupply: undefined,
      rewardPoolSupply: undefined,
      shareRate: undefined,
    };

    const query = byChainId.get(chainConfig.chain.id);
    if (!query) return { ...empty, status: "unavailable" as const };

    // Error before loading: a first fetch that rejects leaves isPending false
    // and data undefined, so testing the loading guard first would park the row
    // in a skeleton forever instead of showing that it failed.
    if (query.isError && !query.data) {
      return { ...empty, status: "error" as const };
    }
    if (query.isPending || !query.data) {
      return { ...empty, status: "loading" as const };
    }

    const rows = query.data;
    const hasError = query.isError || rows.some((r) => r?.status === "failure");

    return {
      chainConfig,
      totalSupply: rows[0]?.result as bigint | undefined,
      equityPoolSupply: rows[1]?.result as bigint | undefined,
      rewardPoolSupply: rows[2]?.result as bigint | undefined,
      shareRate: rows[3]?.result as bigint | undefined,
      status: hasError ? ("error" as const) : ("success" as const),
    };
  });

  // True only while there is nothing at all to show. Any single chain arriving
  // is enough for the grid to be useful, which is the point of the split.
  const isLoading = results.length > 0 && results.every((r) => r.isPending);

  // Stable identity: consumers may put refetch in a dependency array, and a new
  // closure each render would loop them.
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const refetch = useCallback(
    () => Promise.all(resultsRef.current.map((r) => r.refetch())),
    []
  );

  return { chainsStats, isLoading, refetch };
}
