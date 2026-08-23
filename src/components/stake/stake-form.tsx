"use client";

import { useState, useMemo, useCallback, useEffect, useId } from "react";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import {
  Lock,
  Clock,
  Maximize2,
  Sparkles,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useStartStake, useFenixBalance } from "@/hooks/use-fenix-contract";
import {
  formatEther,
  cn,
  calculateTimeBonus,
  calculateSizeBonus,
  calculateTotalBonus,
  calculateInflation,
} from "@/lib/utils";
import { MAX_STAKE_DAYS, MIN_STAKE_DAYS } from "@/config/constants";
import { parseEther } from "viem";

const TERM_MARKERS = [
  { value: 1, label: "1d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
  { value: 1825, label: "5y" },
  { value: 3650, label: "10y" },
  { value: 7777, label: "Max" },
];

interface BonusRowProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}

function BonusRow({ icon, label, value, suffix = "x" }: BonusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-foreground-secondary">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-mono text-sm font-semibold text-foreground">
        <NumberFlow
          value={value}
          format={{ maximumFractionDigits: 4 }}
          transformTiming={{ duration: 400, easing: "ease-out" }}
        />
        {suffix}
      </span>
    </div>
  );
}

export function StakeForm() {
  const t = useTranslations("stake");
  const { chain, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState(365);
  // Owns the id the Input points `aria-describedby` at, so the validation
  // message is announced with the field rather than only implied by a disabled
  // button (WCAG 3.3.1).
  const amountErrorId = useId();

  const { data: fenixBalance, isLoading: isBalanceLoading } = useFenixBalance(chain?.id);

  const {
    startStake,
    isPending,
    isConfirming,
    isSuccess,
    error,
  } = useStartStake();

  // Reset form on successful stake
  useEffect(() => {
    if (isSuccess) {
      setAmount("");
      setTerm(365);
    }
  }, [isSuccess]);

  const balanceFormatted = useMemo(() => {
    if (!fenixBalance) return "0";
    return formatEther(fenixBalance as bigint);
  }, [fenixBalance]);

  const parsedAmount = useMemo(() => {
    const val = parseFloat(amount);
    return isNaN(val) || val <= 0 ? 0 : val;
  }, [amount]);

  const timeBonus = useMemo(() => calculateTimeBonus(term), [term]);
  const sizeBonus = useMemo(
    () => calculateSizeBonus(parsedAmount),
    [parsedAmount]
  );
  const totalBonus = useMemo(
    () => calculateTotalBonus(term, parsedAmount),
    [term, parsedAmount]
  );
  const inflationReward = useMemo(
    () => calculateInflation(parsedAmount, term),
    [parsedAmount, term]
  );
  const estimatedShares = useMemo(
    () => (parsedAmount > 0 ? parsedAmount * totalBonus : 0),
    [parsedAmount, totalBonus]
  );

  const isValidAmount = useMemo(() => {
    if (parsedAmount <= 0) return false;
    if (!fenixBalance) return false;
    try {
      const amountWei = parseEther(amount);
      return amountWei <= (fenixBalance as bigint);
    } catch {
      return false;
    }
  }, [amount, parsedAmount, fenixBalance]);

  // Null while the field is empty or the balance has not resolved: an
  // untouched field is not an error, and "exceeds balance" is not a claim we
  // can make before the balance is known.
  const amountError = useMemo(() => {
    if (amount === "") return null;
    if (parsedAmount <= 0) return t("error_invalid_amount");
    if (isBalanceLoading || fenixBalance === undefined) return null;
    return isValidAmount ? null : t("error_exceeds_balance");
  }, [amount, parsedAmount, isBalanceLoading, fenixBalance, isValidAmount, t]);

  const handleMax = useCallback(() => {
    if (fenixBalance) {
      setAmount(formatEther(fenixBalance as bigint));
    }
  }, [fenixBalance]);

  const handleStake = useCallback(() => {
    if (!chain?.id || !amount) return;
    startStake(chain.id, amount, term);
  }, [chain?.id, amount, term, startStake]);

  const isProcessing = isPending || isConfirming;

  return (
    // `id` is the anchor StakesList's empty-state CTA scrolls to; `scroll-mt-20`
    // clears the 4rem sticky header so the card title is not hidden under it.
    <Card id="stake-form" variant="glow" className="w-full scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-fenix-500" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* FENIX Amount Input */}
        <Field className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-ash-700 dark:text-ash-300">
              {t("amount_label")}
            </Label>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("balance")}:</span>
              {isBalanceLoading ? (
                <Skeleton className="h-3.5 w-16" />
              ) : (
                <span className="font-mono font-medium">
                  <NumberFlow
                    value={parseFloat(balanceFormatted)}
                    format={{ maximumFractionDigits: 4 }}
                    transformTiming={{ duration: 400, easing: "ease-out" }}
                  />
                </span>
              )}
            </div>
          </div>

          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              placeholder={t("amount_placeholder")}
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^[0-9]*\.?[0-9]*$/.test(val) || val === "") {
                  setAmount(val);
                }
              }}
              className={cn(
                "pr-20 font-mono text-lg",
                amountError &&
                  "border-ember-500 focus-visible:border-ember-500 focus-visible:ring-ember-500/50"
              )}
              disabled={isProcessing}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? amountErrorId : undefined}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMax}
              disabled={isProcessing || !fenixBalance}
              // fenix-500 on the input's white fill is 2.80:1 -- below AA for
              // 12px interactive text. text-brand-foreground is the AA-checked
              // brand text tier: 5.14:1 on #ffffff, 7.77:1 on the dark card.
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-foreground hover:text-fenix-800 dark:hover:text-fenix-300"
            >
              {t("max")}
            </Button>
          </div>

          {amountError && (
            <p
              id={amountErrorId}
              role="alert"
              className="flex items-center gap-1.5 text-xs font-medium text-ember-700 dark:text-ember-400"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {amountError}
            </p>
          )}
        </Field>

        {/* Term Slider */}
        <Field labelable={false} className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-ash-700 dark:text-ash-300">
              {t("term_label")}
            </Label>
            <span className="rounded-md bg-fenix-500/10 px-2 py-0.5 font-mono text-sm font-semibold text-brand-foreground">
              {t("term_days", { days: term.toLocaleString() })}
            </span>
          </div>

          <Slider
            min={MIN_STAKE_DAYS}
            max={MAX_STAKE_DAYS}
            step={1}
            value={[term]}
            onValueChange={([v]) => setTerm(v)}
            disabled={isProcessing}
          />

          <div className="flex justify-between px-0.5">
            {TERM_MARKERS.map((marker) => (
              <button
                key={marker.value}
                type="button"
                // Selection is state, not just a fill: without aria-pressed a
                // screen reader reads six identical buttons (WCAG 1.3.1/4.1.2),
                // and the tint alone would carry it (1.4.1).
                aria-pressed={term === marker.value}
                onClick={() => setTerm(marker.value)}
                className={cn(
                  "inline-flex min-h-6 min-w-8 items-center justify-center rounded px-2 text-[11px] font-medium transition-colors",
                  term === marker.value
                    ? "bg-fenix-500/10 text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {marker.label}
              </button>
            ))}
          </div>

          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{t("min_term")}</span>
            <span>{t("max_term")}</span>
          </div>
        </Field>

        {/* Bonus Preview.
            LAY-2: hierarchy comes from the surface shift (bg-muted against the
            card), not from a hairline border on top of a near-invisible tint. */}
        <div className="space-y-3 rounded-xl bg-muted p-4">
          <h4 className="text-sm font-semibold text-ash-700 dark:text-ash-300">
            {t("bonus_preview")}
          </h4>

          <div className="space-y-2.5">
            <BonusRow
              icon={<Clock className="h-3.5 w-3.5" />}
              label={t("time_bonus")}
              value={timeBonus}
            />
            <BonusRow
              icon={<Maximize2 className="h-3.5 w-3.5" />}
              label={t("size_bonus")}
              value={sizeBonus}
            />

            {/* bg-border is #262626 in dark -- the same hex as the bg-muted
                panel it sits on, so the default Separator would vanish here.
                One step further from the surface in both themes. */}
            <Separator className="my-1 bg-ash-300 dark:bg-ash-700" />

            <BonusRow
              icon={<Sparkles className="h-3.5 w-3.5 text-fenix-500" />}
              label={t("total_bonus")}
              value={totalBonus}
            />
          </div>
        </div>

        {/* Estimated Outcomes */}
        <div className="space-y-2.5 rounded-xl bg-muted p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">
              {t("shares_estimate")}
            </span>
            <span className="font-mono text-sm font-semibold text-foreground">
              <NumberFlow
                value={estimatedShares}
                format={{ maximumFractionDigits: 2 }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">
              {t("inflation_estimate")}
            </span>
            <span className="font-mono text-sm font-semibold text-brand-foreground">
              <NumberFlow
                value={inflationReward}
                format={{ maximumFractionDigits: 4 }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />{" "}
              FENIX
            </span>
          </div>
        </div>

        {/* Stake Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleStake}
          loading={isProcessing}
          disabled={!isConnected || !isValidAmount || isProcessing}
        >
          {isConfirming
            ? t("confirming")
            : isPending
              ? t("staking")
              : t("stake_button")}
        </Button>

        {/* Status Messages */}
        {isSuccess && (
          <Alert variant="success">
            <CheckCircle />
            <AlertDescription>
              {t("success", {
                amount: parseFloat(amount).toLocaleString(),
                term: term.toLocaleString(),
              })}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{t("error")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
