"use client";

import { useState, useMemo, useCallback } from "react";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import {
  Clock,
  Coins,
  BarChart3,
  Calendar,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  PauseCircle,
  Timer,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useUserStakes,
  useEndStake,
  useDeferStake,
} from "@/hooks/use-fenix-contract";
import {
  formatEther,
  cn,
  calculateEarlyPenalty,
  calculateLatePenalty,
  secondsToDays,
} from "@/lib/utils";
import { SECONDS_PER_DAY } from "@/config/constants";
import { StakeStatus, type StakeInfo } from "@/types/contracts";

export function getMaturityTs(stake: StakeInfo): number {
  return Number(stake.startTs) + Number(stake.term) * SECONDS_PER_DAY;
}

export function getStakeStatus(
  stake: StakeInfo,
  now: number
): {
  label: string;
  variant: "default" | "success" | "warning" | "destructive" | "secondary";
  icon: React.ReactNode;
} {
  if (stake.status === StakeStatus.Deferred) {
    return {
      label: "deferred",
      variant: "secondary",
      icon: <PauseCircle className="h-3 w-3" />,
    };
  }
  if (stake.status >= StakeStatus.EndedOnTime) {
    return {
      label: "ended",
      variant: "secondary",
      icon: <CheckCircle className="h-3 w-3" />,
    };
  }

  const maturity = getMaturityTs(stake);
  if (now >= maturity) {
    return {
      label: "matured",
      variant: "success",
      icon: <CheckCircle className="h-3 w-3" />,
    };
  }

  return {
    label: "active",
    variant: "default",
    icon: <Timer className="h-3 w-3" />,
  };
}

export function getProgress(stake: StakeInfo, now: number): number {
  const termSeconds = Number(stake.term) * SECONDS_PER_DAY;
  const startTs = Number(stake.startTs);
  const elapsed = now - startTs;

  if (elapsed <= 0) return 0;
  if (elapsed >= termSeconds) return 100;
  return (elapsed / termSeconds) * 100;
}

export function getDaysInfo(
  stake: StakeInfo,
  now: number
): { days: number; isLate: boolean } {
  const maturity = getMaturityTs(stake);
  const diff = maturity - now;
  const days = Math.abs(Math.ceil(diff / SECONDS_PER_DAY));

  return { days, isLate: diff < 0 };
}

export function getPenaltyPreview(
  stake: StakeInfo,
  now: number
): { penalty: number; payout: number } | null {
  const maturity = getMaturityTs(stake);
  const termDays = Number(stake.term);
  const amount = parseFloat(formatEther(stake.fenix));

  if (now < maturity) {
    // Early ending
    const startTs = Number(stake.startTs);
    const elapsedDays = secondsToDays(now - startTs);
    const penaltyRatio = calculateEarlyPenalty(elapsedDays, termDays);
    const payout = amount * penaltyRatio;
    return { penalty: 1 - penaltyRatio, payout };
  } else if (now > maturity) {
    // Late ending
    const lateDays = secondsToDays(now - maturity);
    const retainedRatio = calculateLatePenalty(lateDays);
    const payout = amount * retainedRatio;
    return { penalty: 1 - retainedRatio, payout };
  }

  return { penalty: 0, payout: amount };
}

interface StakeCardProps {
  stake: StakeInfo;
  index: number;
  onEndStake: (index: number) => void;
  onDeferStake: (index: number) => void;
  isEndPending: boolean;
  isDeferPending: boolean;
}

function StakeCard({
  stake,
  index,
  onEndStake,
  onDeferStake,
  isEndPending,
  isDeferPending,
}: StakeCardProps) {
  const t = useTranslations("stakes");
  const now = Math.floor(Date.now() / 1000);

  const status = getStakeStatus(stake, now);
  const progress = getProgress(stake, now);
  const daysInfo = getDaysInfo(stake, now);
  const penaltyInfo = getPenaltyPreview(stake, now);
  const isEnded = stake.status >= StakeStatus.EndedOnTime;

  const maturityDate = new Date(getMaturityTs(stake) * 1000);
  const amountFormatted = parseFloat(formatEther(stake.fenix));
  const sharesFormatted = parseFloat(formatEther(stake.shares));

  return (
    <Card variant="glow" className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground">
            {t("stake_id", { id: index + 1 })}
          </h4>
          <Badge variant={status.variant} className="flex items-center gap-1">
            {status.icon}
            {t(status.label)}
          </Badge>
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Coins className="h-3 w-3" />
              {t("amount")}
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              <NumberFlow
                value={amountFormatted}
                format={{ maximumFractionDigits: 4 }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />{" "}
              <span className="text-ash-400">FENIX</span>
            </p>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <BarChart3 className="h-3 w-3" />
              {t("shares")}
            </div>
            <p className="font-mono text-sm font-semibold text-foreground">
              <NumberFlow
                value={sharesFormatted}
                format={{ maximumFractionDigits: 2 }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />
            </p>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("term")}
            </div>
            <p className="text-sm font-semibold text-foreground">
              <NumberFlow
                value={Number(stake.term)}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />{" "}
              days
            </p>
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {t("maturity")}
            </div>
            <p className="text-sm font-semibold text-foreground">
              {maturityDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        {!isEnded && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t("progress")}
              </span>
              <span
                className={cn(
                  "font-medium",
                  daysInfo.isLate
                    ? "text-ember-500"
                    : "text-foreground-secondary"
                )}
              >
                {daysInfo.isLate
                  ? t("days_late", { days: daysInfo.days })
                  : progress >= 100
                    ? t("matured")
                    : t("days_remaining", { days: daysInfo.days })}
              </span>
            </div>

            <Progress
              value={Math.min(progress, 100)}
              className={cn(
                "bg-ash-200 dark:bg-ash-800 [&>[data-slot=progress-indicator]]:rounded-full [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:duration-500",
                progress >= 100
                  ? "[&>[data-slot=progress-indicator]]:from-emerald-500 [&>[data-slot=progress-indicator]]:to-emerald-400"
                  : "[&>[data-slot=progress-indicator]]:from-fenix-500 [&>[data-slot=progress-indicator]]:to-ember-500"
              )}
            />
          </div>
        )}

        {/* Penalty Preview */}
        {!isEnded && penaltyInfo && penaltyInfo.penalty > 0 && (
          <Alert variant="warning" className="mt-3">
            <AlertTriangle />
            <AlertDescription>
              <p className="font-medium">
                {t("penalty")}:{" "}
                <NumberFlow
                  value={penaltyInfo.penalty * 100}
                  format={{ maximumFractionDigits: 1 }}
                  transformTiming={{ duration: 400, easing: "ease-out" }}
                />
                %
              </p>
              <p>
                {t("payout")}:{" "}
                <NumberFlow
                  value={penaltyInfo.payout}
                  format={{ maximumFractionDigits: 4 }}
                  transformTiming={{ duration: 400, easing: "ease-out" }}
                />{" "}
                FENIX
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        {!isEnded && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => onEndStake(index)}
              loading={isEndPending}
              disabled={isEndPending || isDeferPending}
            >
              {t("end_stake")}
            </Button>
            {stake.status !== StakeStatus.Deferred && progress >= 100 && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onDeferStake(index)}
                loading={isDeferPending}
                disabled={isEndPending || isDeferPending}
              >
                {t("defer_stake")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PAGE_SIZE = 10;

export function StakesList() {
  const t = useTranslations("stakes");
  const tStake = useTranslations("stake");
  const { chain, address: userAddress } = useAccount();
  const [page, setPage] = useState(0);
  const { data: stakesData, isLoading, stakeCount, totalPages, startIndex } = useUserStakes(chain?.id, page, PAGE_SIZE);

  const {
    endStake,
    isPending: isEndPending,
    isConfirming: isEndConfirming,
    error: endError,
  } = useEndStake();

  const {
    deferStake,
    isPending: isDeferPending,
    isConfirming: isDeferConfirming,
    error: deferError,
  } = useDeferStake();

  const stakes = useMemo(() => {
    if (!stakesData) return [];
    const rawStakes = stakesData as unknown;
    if (!Array.isArray(rawStakes)) return [];

    return rawStakes.map(
      (s: {
        status: number;
        startTs: bigint;
        deferralTs: bigint;
        endTs: bigint;
        term: bigint;
        fenix: bigint;
        shares: bigint;
        payout: bigint;
      }) =>
        ({
          status: s.status as StakeStatus,
          startTs: s.startTs,
          deferralTs: s.deferralTs,
          endTs: s.endTs,
          term: s.term,
          fenix: s.fenix,
          shares: s.shares,
          payout: s.payout,
        }) satisfies StakeInfo
    );
  }, [stakesData]);

  const handleEndStake = useCallback(
    (index: number) => {
      if (!chain?.id) return;
      endStake(chain.id, index);
    },
    [chain?.id, endStake]
  );

  const handleDeferStake = useCallback(
    (index: number) => {
      if (!chain?.id || !userAddress) return;
      deferStake(chain.id, index, userAddress);
    },
    [chain?.id, userAddress, deferStake]
  );

  // StakeForm renders directly above this list on the same page, so the empty
  // state's next action is a scroll, not a route change - a /stake link would
  // be a no-op. The form's Card carries id="stake-form" (with scroll-mt for the
  // sticky header); the window fallback only covers the form failing to mount.
  const scrollToStakeForm = useCallback(() => {
    const form = document.getElementById("stake-form");
    if (form) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <div className="w-full space-y-4">
      <h3 className="text-lg font-semibold text-foreground">
        {t("title")}
      </h3>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} variant="glow">
              <CardContent className="space-y-3 p-5">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stakes.length === 0 && stakeCount === 0 ? (
        <Card variant="glow">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="h-6 w-6 text-ash-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("no_stakes")}
            </p>
            <Button size="sm" className="mt-4" onClick={scrollToStakeForm}>
              <Coins className="h-4 w-4" />
              {tStake("stake_button")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {stakes.map((stake, i) => (
              <StakeCard
                key={startIndex + i}
                stake={stake}
                index={startIndex + i}
                onEndStake={handleEndStake}
                onDeferStake={handleDeferStake}
                isEndPending={isEndPending || isEndConfirming}
                isDeferPending={isDeferPending || isDeferConfirming}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("previous")}
              </Button>
              <span className="text-sm text-foreground-secondary">
                {t("page_of", { page: page + 1, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                {t("next")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Error messages */}
      {(endError || deferError) && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {endError ? t("error_ending") : t("error_deferring")}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
