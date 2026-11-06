"use client";

import { useSearchParams } from "next/navigation";
import { useConnection } from "wagmi";
import { mainnet } from "wagmi/chains";
import { DashboardChainSelector } from "@/components/dashboard/dashboard-chain-selector";
import { LiquidityPairsSection } from "@/components/dashboard/liquidity-pairs";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { SupplyChart } from "@/components/charts/equity-pool-chart";
import { YieldChart } from "@/components/charts/yield-chart";
import { getChainConfig } from "@/config/chains";

export function DashboardOverview() {
  const { chain: walletChain } = useConnection();
  const searchParams = useSearchParams();
  const requestedChain = getChainConfig(Number(searchParams.get("chain")));

  const walletChainId = walletChain && getChainConfig(walletChain.id)?.enabled
    ? walletChain.id
    : undefined;
  const chainId = (requestedChain?.enabled ? requestedChain.chain.id : undefined)
    ?? walletChainId
    ?? mainnet.id;

  function selectChain(nextChainId: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("chain", String(nextChainId));
    window.history.pushState(null, "", `?${params.toString()}${window.location.hash}`);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <DashboardChainSelector
          chainId={chainId}
          onChainChange={selectChain}
        />
        <StatsGrid chainId={chainId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <YieldChart amount={1000} term={365} />
        <SupplyChart chainId={chainId} />
      </div>

      <LiquidityPairsSection filterByChain chainId={chainId} />
    </div>
  );
}
