"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import { useCooldownUnlockTs } from "@/hooks/use-fenix-contract";
import { useCountdown } from "@/hooks/use-countdown";
import { mainnet } from "wagmi/chains";

export function FlushCountdownDisplay() {
  const t = useTranslations("hero");
  const { data: cooldownUnlockTs } = useCooldownUnlockTs(mainnet.id);

  const target = useMemo(() => {
    if (!cooldownUnlockTs) return 0;
    return Number(cooldownUnlockTs);
  }, [cooldownUnlockTs]);

  const { days, hours, minutes, seconds, ready } = useCountdown(target);

  if (!target) return null;

  return (
    <div
      className="inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-5 py-3 backdrop-blur-md"
    >
      <span className="text-sm font-medium text-muted-foreground">
        {t("next_flush")}
      </span>
      {ready ? (
        <span className="text-sm font-bold text-success-foreground">
          {t("flush_ready")}
        </span>
      ) : (
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-foreground">
          {days > 0 && (
            <>
              <NumberFlow
                value={days}
                transformTiming={{ duration: 400, easing: "ease-out" }}
              />
              <span className="text-muted-foreground font-normal">d</span>
            </>
          )}
          <NumberFlow
            value={hours}
            format={{ minimumIntegerDigits: days > 0 ? 2 : 1 }}
            transformTiming={{ duration: 400, easing: "ease-out" }}
          />
          <span className="text-muted-foreground font-normal">h</span>
          <NumberFlow
            value={minutes}
            format={{ minimumIntegerDigits: 2 }}
            transformTiming={{ duration: 400, easing: "ease-out" }}
          />
          <span className="text-muted-foreground font-normal">m</span>
          <NumberFlow
            value={seconds}
            format={{ minimumIntegerDigits: 2 }}
            transformTiming={{ duration: 400, easing: "ease-out" }}
          />
          <span className="text-muted-foreground font-normal">s</span>
        </span>
      )}
    </div>
  );
}

