"use client";

import { useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import {
  Trophy,
  Vault,
  Clock,
  Zap,
  Percent,
  Coins,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlushCountdown } from "@/components/ui/flush-countdown";
import {
  useFlushRewards,
  useFenixStats,
  useUserStakes,
  useCooldownUnlockTs,
} from "@/hooks/use-fenix-contract";
import { formatEther } from "@/lib/utils";

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  isLoading: boolean;
}

function StatRow({ icon, label, value, isLoading }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2.5 text-sm text-foreground-secondary">
        {icon}
        <span>{label}</span>
      </div>
      {isLoading ? (
        <Skeleton className="h-5 w-24" />
      ) : (
        <div className="text-right font-mono text-sm font-semibold text-foreground">
          {value}
        </div>
      )}
    </div>
  );
}

export function RewardsPanel() {
  const t = useTranslations("rewards");
  const { chain, isConnected } = useAccount();

  const {
    equityPoolSupply,
    rewardPoolSupply,
    equityPoolTotalShares,
    isLoading: isStatsLoading,
  } = useFenixStats(chain?.id);

  const { data: userStakes, isLoading: isStakesLoading } = useUserStakes(
    chain?.id
  );

  const { data: cooldownUnlockTs, isLoading: isCooldownLoading } =
    useCooldownUnlockTs(chain?.id);

  const {
    flushRewards,
    isPending,
    isConfirming,
    isSuccess,
    error,
  } = useFlushRewards();

  const nextFlushTs = useMemo(() => {
    if (!cooldownUnlockTs) return 0;
    return Number(cooldownUnlockTs);
  }, [cooldownUnlockTs]);

  // countdown is now rendered as a component, not a string

  const equityPoolNum = useMemo(() => {
    if (equityPoolSupply === undefined) return 0;
    return parseFloat(formatEther(equityPoolSupply));
  }, [equityPoolSupply]);

  const rewardPoolNum = useMemo(() => {
    if (rewardPoolSupply === undefined) return 0;
    return parseFloat(formatEther(rewardPoolSupply));
  }, [rewardPoolSupply]);

  // Compute user's share percentage from stakes
  const userShareInfo = useMemo(() => {
    if (!userStakes || !equityPoolTotalShares) {
      return { sharePercent: 0, estimatedReward: 0 };
    }

    const rawStakes = userStakes as unknown;
    if (!Array.isArray(rawStakes) || rawStakes.length === 0) {
      return { sharePercent: 0, estimatedReward: 0 };
    }

    const totalUserShares = rawStakes.reduce(
      (acc: bigint, s: { shares: bigint; status: number }) => {
        // Only count active and deferred stakes (status 0 or 1)
        if (s.status <= 1) return acc + s.shares;
        return acc;
      },
      0n
    );

    const totalPoolShares = equityPoolTotalShares;
    if (!totalPoolShares || totalPoolShares === 0n) {
      return { sharePercent: 0, estimatedReward: 0 };
    }

    const sharePercent =
      (Number(totalUserShares) / Number(totalPoolShares)) * 100;
    const estimatedReward = rewardPoolNum * (sharePercent / 100);

    return { sharePercent, estimatedReward };
  }, [userStakes, equityPoolTotalShares, rewardPoolNum]);

  const handleFlush = useCallback(() => {
    if (!chain?.id) return;
    flushRewards(chain.id);
  }, [chain?.id, flushRewards]);

  const isProcessing = isPending || isConfirming;
  const isLoading = isStatsLoading || isStakesLoading;
  const isCooldownActive =
    nextFlushTs > 0 && nextFlushTs > Math.floor(Date.now() / 1000);

  return (
    <Card variant="glow" className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-fenix-500" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-1">
        {/* Pool Balances */}
        <div className="divide-y divide-ash-100 dark:divide-ash-800">
          <StatRow
            icon={<Vault className="h-4 w-4 text-fenix-500" />}
            label={t("equity_pool")}
            isLoading={isLoading}
            value={
              <span>
                <NumberFlow
                  value={equityPoolNum}
                  format={{
                    maximumFractionDigits: 2,
                    notation: equityPoolNum > 1_000_000 ? "compact" : "standard",
                  }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />{" "}
                <span className="text-ash-400">FENIX</span>
              </span>
            }
          />

          <StatRow
            icon={<Coins className="h-4 w-4 text-ember-500" />}
            label={t("adoption_pool")}
            isLoading={isLoading}
            value={
              <span>
                <NumberFlow
                  value={rewardPoolNum}
                  format={{
                    maximumFractionDigits: 2,
                    notation: rewardPoolNum > 1_000_000 ? "compact" : "standard",
                  }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />{" "}
                <span className="text-ash-400">FENIX</span>
              </span>
            }
          />

          <StatRow
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            label={t("next_flush")}
            isLoading={isCooldownLoading}
            value={<FlushCountdown target={nextFlushTs} readyLabel={t("ready")} />}
          />
        </div>

        {/* User Share Info.
            LAY-2: hierarchy comes from the surface shift (bg-muted against the
            card), not from a hairline border on top of a near-invisible tint. */}
        <div className="mt-4 space-y-3 rounded-xl bg-muted p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <Percent className="h-3.5 w-3.5" />
              {t("your_share")}
            </div>
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span className="font-mono text-sm font-semibold text-brand-foreground">
                <NumberFlow
                  value={userShareInfo.sharePercent}
                  format={{ maximumFractionDigits: 4 }}
                  transformTiming={{ duration: 400, easing: "ease-out" }}
                />
                %
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <Zap className="h-3.5 w-3.5" />
              {t("estimated_reward")}
            </div>
            {isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <span className="font-mono text-sm font-semibold text-brand-foreground">
                <NumberFlow
                  value={userShareInfo.estimatedReward}
                  format={{ maximumFractionDigits: 4 }}
                  transformTiming={{ duration: 400, easing: "ease-out" }}
                />{" "}
                FENIX
              </span>
            )}
          </div>
        </div>

        {/* Flush Button */}
        <div className="pt-4">
          <Button
            className="w-full"
            size="lg"
            onClick={handleFlush}
            loading={isProcessing}
            disabled={!isConnected || isProcessing || isCooldownActive}
          >
            <Zap className="h-4 w-4" />
            {isConfirming
              ? t("confirming")
              : isPending
                ? t("flushing")
                : t("flush_button")}
          </Button>
        </div>

        {/* Status Messages */}
        {isSuccess && (
          <Alert variant="success">
            <CheckCircle />
            <AlertDescription>{t("flush_success")}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{t("flush_error")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
