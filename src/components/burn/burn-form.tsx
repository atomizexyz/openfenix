"use client";

import { useState, useMemo, useCallback, useEffect, useId } from "react";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import { ArrowDown, CheckCircle, AlertCircle, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";

import {
  useBurnXen,
  useApproveXen,
  useXenBalance,
  useXenAllowance,
} from "@/hooks/use-fenix-contract";
import { getChainConfig } from "@/config/chains";
import { formatEther, cn } from "@/lib/utils";
import { XEN_TO_FENIX_RATIO } from "@/config/constants";
import { parseEther } from "viem";

export function BurnForm() {
  const t = useTranslations("burn");
  const { chain, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  // Ties the "you receive" Label to the read-only <output> below. The shared
  // <Field> cannot supply this one: its context is only readable by components
  // rendered inside it, and the readout is a plain element in this file.
  const receiveId = useId();
  // Owns the id the Input points `aria-describedby` at, so the validation
  // message is announced with the field rather than only implied by a disabled
  // button (WCAG 3.3.1).
  const amountErrorId = useId();

  const { data: xenBalance, isLoading: isBalanceLoading, refetch: refetchBalance } = useXenBalance(chain?.id);
  const { data: xenAllowance, refetch: refetchAllowance } = useXenAllowance(chain?.id);

  const {
    burn,
    isPending: isBurnPending,
    isConfirming: isBurnConfirming,
    isSuccess: isBurnSuccess,
    error: burnError,
  } = useBurnXen();

  const {
    approve,
    isPending: isApprovePending,
    isConfirming: isApproveConfirming,
    isSuccess: isApproveSuccess,
    error: approveError,
  } = useApproveXen();

  // Refetch allowance after successful approval
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
    }
  }, [isApproveSuccess, refetchAllowance]);

  // Reset amount and refetch balances after successful burn
  useEffect(() => {
    if (isBurnSuccess) {
      setAmount("");
      refetchBalance();
      refetchAllowance();
    }
  }, [isBurnSuccess, refetchBalance, refetchAllowance]);

  const balanceFormatted = useMemo(() => {
    if (!xenBalance) return "0";
    return formatEther(xenBalance as bigint);
  }, [xenBalance]);

  const fenixReceived = useMemo(() => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return parsed / Number(XEN_TO_FENIX_RATIO);
  }, [amount]);

  const needsApproval = useMemo(() => {
    if (!amount || !xenAllowance) return true;
    try {
      const amountWei = parseEther(amount);
      return (xenAllowance as bigint) < amountWei;
    } catch {
      return true;
    }
  }, [amount, xenAllowance]);

  const isValidAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return false;
    if (!xenBalance) return false;
    try {
      const amountWei = parseEther(amount);
      return amountWei <= (xenBalance as bigint);
    } catch {
      return false;
    }
  }, [amount, xenBalance]);

  // Null while the field is empty or the balance has not resolved: an
  // untouched field is not an error, and "exceeds balance" is not a claim we
  // can make before the balance is known.
  const amountError = useMemo(() => {
    if (amount === "") return null;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return t("error_invalid_amount");
    if (isBalanceLoading || xenBalance === undefined) return null;
    return isValidAmount ? null : t("error_exceeds_balance");
  }, [amount, isBalanceLoading, xenBalance, isValidAmount, t]);

  const handleMax = useCallback(() => {
    if (xenBalance) {
      setAmount(formatEther(xenBalance as bigint));
    }
  }, [xenBalance]);

  const handleApprove = useCallback(() => {
    if (!chain?.id || !amount) return;
    approve(chain.id, amount);
  }, [chain?.id, amount, approve]);

  const handleBurn = useCallback(() => {
    if (!chain?.id || !amount) return;
    burn(chain.id, amount);
  }, [chain?.id, amount, burn]);

  const isProcessing = isBurnPending || isBurnConfirming || isApprovePending || isApproveConfirming;
  const chainSupported = chain?.id ? !!getChainConfig(chain.id) : false;

  return (
    <Card variant="glow" className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-fenix-500" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* XEN Input */}
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
                    format={{ maximumFractionDigits: 2 }}
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
              disabled={isProcessing || !xenBalance}
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

        {/* Arrow indicator */}
        <div className="flex justify-center">
          {/* LAY-2: a filled chip on the card surface rather than a ringed
              hole punched in it. */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* FENIX Output */}
        <div className="space-y-2">
          <Label
            htmlFor={receiveId}
            className="text-sm font-medium text-ash-700 dark:text-ash-300"
          >
            {t("receive_label")}
          </Label>
          {/* <output> is a labelable element, so the Label above names this
              read-only readout exactly as it would name an <input>. */}
          <output
            id={receiveId}
            className="flex h-12 items-center rounded-lg bg-muted px-4"
          >
            <span className="font-mono text-lg font-semibold text-foreground">
              <NumberFlow
                value={fenixReceived}
                format={{ maximumFractionDigits: 4 }}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />
            </span>
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              FENIX
            </span>
          </output>
          <p className="text-xs text-muted-foreground">{t("ratio")}</p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {needsApproval && isValidAmount ? (
            <Button
              className="w-full"
              size="lg"
              onClick={handleApprove}
              loading={isApprovePending || isApproveConfirming}
              disabled={!isConnected || !chainSupported || isProcessing}
            >
              {isApproveConfirming
                ? t("confirming")
                : isApprovePending
                  ? t("approving")
                  : t("approve")}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleBurn}
              loading={isBurnPending || isBurnConfirming}
              disabled={!isConnected || !chainSupported || !isValidAmount || isProcessing}
            >
              {isBurnConfirming
                ? t("confirming")
                : isBurnPending
                  ? t("burning")
                  : t("burn_button")}
            </Button>
          )}
        </div>

        {/* Status messages */}
        {isBurnSuccess && (
          <Alert variant="success">
            <CheckCircle />
            <AlertDescription>
              {t("success", {
                xen: parseFloat(amount).toLocaleString(),
                fenix: fenixReceived.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                }),
              })}
            </AlertDescription>
          </Alert>
        )}

        {isApproveSuccess && needsApproval && (
          <Alert variant="success">
            <CheckCircle />
            <AlertDescription>{t("approval_confirmed")}</AlertDescription>
          </Alert>
        )}

        {isConnected && !chainSupported && (
          <Alert variant="warning">
            <AlertCircle />
            <AlertDescription>{t("unsupported_network")}</AlertDescription>
          </Alert>
        )}

        {(burnError || approveError) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="break-all">
              {(approveError as unknown as { shortMessage?: string })?.shortMessage ?? (burnError as unknown as { shortMessage?: string })?.shortMessage ?? (approveError?.message || burnError?.message || t("error"))}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
