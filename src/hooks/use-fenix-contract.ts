"use client";

import { useEffect } from "react";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useConnection } from "wagmi";
import { FENIX_ABI, XEN_ABI } from "@/config/abi";
import { getChainConfig } from "@/config/chains";
import { parseEther } from "viem";

/*
 * Polling cadence, matched to how often each value can actually change. There
 * is no global interval: a read that does not poll on purpose does not poll.
 * Every confirmed write (see useConfirmedWrite) refreshes all contract reads at
 * once, so the user's own actions never wait on a poll to show up.
 */
/** Protocol-wide figures other people's burns and stakes move. */
const PROTOCOL_POLL_MS = 30_000;
/** The connected wallet's own state; mostly changes through our own writes. */
const ACCOUNT_POLL_MS = 60_000;
/** The reward-flush cooldown moves once a flush, roughly every 13 weeks. */
const COOLDOWN_POLL_MS = 10 * 60_000;

function isContractRead(query: Query) {
  const kind = query.queryKey[0];
  return kind === "readContract" || kind === "readContracts";
}

/** A contract write that refreshes every contract read once it confirms. */
function useConfirmedWrite() {
  const queryClient = useQueryClient();
  const { mutate: writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) queryClient.invalidateQueries({ predicate: isContractRead });
  }, [isSuccess, hash, queryClient]);

  return { writeContract, hash, isPending, isConfirming, isSuccess, error };
}

export function useFenixStats(chainId?: number) {
  const config = chainId ? getChainConfig(chainId) : undefined;
  const address = config?.fenixContract;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address && chainId
      ? [
          { address, abi: FENIX_ABI, functionName: "totalSupply", chainId },
          { address, abi: FENIX_ABI, functionName: "equityPoolSupply", chainId },
          { address, abi: FENIX_ABI, functionName: "equityPoolTotalShares", chainId },
          { address, abi: FENIX_ABI, functionName: "rewardPoolSupply", chainId },
          { address, abi: FENIX_ABI, functionName: "shareRate", chainId },
        ]
      : [],
    query: { enabled: !!address && !!chainId, refetchInterval: PROTOCOL_POLL_MS },
  });

  return {
    totalSupply: data?.[0]?.result as bigint | undefined,
    equityPoolSupply: data?.[1]?.result as bigint | undefined,
    equityPoolTotalShares: data?.[2]?.result as bigint | undefined,
    rewardPoolSupply: data?.[3]?.result as bigint | undefined,
    shareRate: data?.[4]?.result as bigint | undefined,
    isLoading,
    refetch,
  };
}

export function useFenixBalance(chainId?: number) {
  const { address: userAddress } = useConnection();
  const config = chainId ? getChainConfig(chainId) : undefined;

  return useReadContract({
    address: config?.fenixContract,
    abi: FENIX_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: {
      enabled: !!config?.fenixContract && !!userAddress && !!chainId,
      refetchInterval: ACCOUNT_POLL_MS,
    },
  });
}

export function useXenBalance(chainId?: number) {
  const { address: userAddress } = useConnection();
  const config = chainId ? getChainConfig(chainId) : undefined;

  return useReadContract({
    address: config?.xenContract,
    abi: XEN_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: {
      enabled: !!config?.xenContract && !!userAddress && !!chainId,
      refetchInterval: ACCOUNT_POLL_MS,
    },
  });
}

export function useXenAllowance(chainId?: number) {
  const { address: userAddress } = useConnection();
  const config = chainId ? getChainConfig(chainId) : undefined;

  return useReadContract({
    address: config?.xenContract,
    abi: XEN_ABI,
    functionName: "allowance",
    args:
      userAddress && config?.fenixContract
        ? [userAddress, config.fenixContract]
        : undefined,
    chainId,
    query: {
      enabled: !!config?.xenContract && !!userAddress && !!config?.fenixContract && !!chainId,
      refetchInterval: ACCOUNT_POLL_MS,
    },
  });
}

export function useStakeCount(chainId?: number) {
  const { address: userAddress } = useConnection();
  const config = chainId ? getChainConfig(chainId) : undefined;

  return useReadContract({
    address: config?.fenixContract,
    abi: FENIX_ABI,
    functionName: "stakeCount",
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: {
      enabled: !!config?.fenixContract && !!userAddress && !!chainId,
      refetchInterval: ACCOUNT_POLL_MS,
    },
  });
}

/** Page size that reads every stake the wallet has, in one multicall. */
export const ALL_STAKES = Number.POSITIVE_INFINITY;

export function useUserStakes(chainId?: number, page = 0, pageSize = 10) {
  const { address: userAddress } = useConnection();
  const config = chainId ? getChainConfig(chainId) : undefined;
  const { data: stakeCount } = useStakeCount(chainId);

  const count = stakeCount ? Number(stakeCount) : 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const startIndex = page * pageSize;
  const endIndex = Math.min(startIndex + pageSize, count);
  const pageLength = Math.max(0, endIndex - startIndex);

  const { data: rawData, isLoading, refetch } = useReadContracts({
    contracts:
      config?.fenixContract && userAddress && chainId && pageLength > 0
        ? Array.from({ length: pageLength }, (_, i) => ({
            address: config.fenixContract,
            abi: FENIX_ABI,
            functionName: "stakeFor" as const,
            args: [userAddress, BigInt(startIndex + i)] as const,
            chainId,
          }))
        : [],
    query: {
      enabled: !!config?.fenixContract && !!userAddress && !!chainId && pageLength > 0,
      refetchInterval: ACCOUNT_POLL_MS,
    },
  });

  const data = rawData
    ?.filter((r) => r.status === "success" && r.result)
    .map((r) => r.result) ?? [];

  return { data, isLoading, refetch, stakeCount: count, totalPages, page, startIndex };
}

export function useBurnXen() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function burn(chainId: number, amount: string) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.fenixContract,
      abi: FENIX_ABI,
      functionName: "burnXEN",
      args: [parseEther(amount)],
      chainId,
    });
  }

  return { burn, hash, isPending, isConfirming, isSuccess, error };
}

export function useApproveXen() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function approve(chainId: number, amount: string) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.xenContract,
      abi: XEN_ABI,
      functionName: "approve",
      args: [config.fenixContract, parseEther(amount)],
      chainId,
    });
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

export function useStartStake() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function startStake(chainId: number, amount: string, termDays: number) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.fenixContract,
      abi: FENIX_ABI,
      functionName: "startStake",
      args: [parseEther(amount), BigInt(termDays)],
      chainId,
    });
  }

  return { startStake, hash, isPending, isConfirming, isSuccess, error };
}

export function useEndStake() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function endStake(chainId: number, stakeIndex: number) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.fenixContract,
      abi: FENIX_ABI,
      functionName: "endStake",
      args: [BigInt(stakeIndex)],
      chainId,
    });
  }

  return { endStake, hash, isPending, isConfirming, isSuccess, error };
}

export function useDeferStake() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function deferStake(chainId: number, stakeIndex: number, stakerAddress: `0x${string}`) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.fenixContract,
      abi: FENIX_ABI,
      functionName: "deferStake",
      args: [BigInt(stakeIndex), stakerAddress],
      chainId,
    });
  }

  return { deferStake, hash, isPending, isConfirming, isSuccess, error };
}

export function useCooldownUnlockTs(chainId?: number) {
  const config = chainId ? getChainConfig(chainId) : undefined;

  return useReadContract({
    address: config?.fenixContract,
    abi: FENIX_ABI,
    functionName: "cooldownUnlockTs",
    chainId,
    query: {
      enabled: !!config?.fenixContract && !!chainId,
      refetchInterval: COOLDOWN_POLL_MS,
    },
  });
}

export function useFlushRewards() {
  const { writeContract, hash, isPending, isConfirming, isSuccess, error } =
    useConfirmedWrite();

  function flushRewards(chainId: number) {
    const config = getChainConfig(chainId);
    if (!config) throw new Error("Chain not supported");

    writeContract({
      address: config.fenixContract,
      abi: FENIX_ABI,
      functionName: "flushRewardPool",
      chainId,
    });
  }

  return { flushRewards, hash, isPending, isConfirming, isSuccess, error };
}
