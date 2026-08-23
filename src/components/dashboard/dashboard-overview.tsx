"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { mainnet } from "wagmi/chains";
import { DashboardChainSelector } from "@/components/dashboard/dashboard-chain-selector";
import { LiquidityPairsSection } from "@/components/dashboard/liquidity-pairs";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { SupplyChart } from "@/components/charts/equity-pool-chart";
import { YieldChart } from "@/components/charts/yield-chart";
import { getChainConfig } from "@/config/chains";

export function DashboardOverview() {
  const { chain: walletChain } = useAccount();
  const [selectedChainId, setSelectedChainId] = useState<number>();

  const walletChainId = walletChain && getChainConfig(walletChain.id)
    ? walletChain.id
    : undefined;
  const chainId = selectedChainId ?? walletChainId ?? mainnet.id;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <DashboardChainSelector
          chainId={chainId}
          onChainChange={setSelectedChainId}
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
