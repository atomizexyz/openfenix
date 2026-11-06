"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FENIX_CHAINS } from "@/config/chains";
import { ChainIcon } from "@/components/chain-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SupplyGrid = lazy(() =>
  import("./equity-pool-chart").then((module) => ({ default: module.ChainSupplyGrid }))
);

function SupplyGridPlaceholder() {
  const t = useTranslations("stats");
  return (
    <section className="space-y-6" aria-busy="true">
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t("supply_distribution")}
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {FENIX_CHAINS.filter((chain) => chain.enabled).map(({ chain, iconSlug }) => (
          <Card key={chain.id} variant="glow">
            <CardContent className="p-4">
              <h3 className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
                <ChainIcon slug={iconSlug} name={chain.name} size={18} />
                {chain.name}
              </h3>
              <div className="flex h-[160px] items-center justify-center">
                <Skeleton className="h-28 w-28 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Keep chart code off the landing path; load it just before scrolling to it. */
export function LazySupplyGrid() {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container}>
      <Suspense fallback={<SupplyGridPlaceholder />}>
        {visible ? <SupplyGrid /> : <SupplyGridPlaceholder />}
      </Suspense>
    </div>
  );
}
