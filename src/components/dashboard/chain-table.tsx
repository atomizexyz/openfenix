"use client";

import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import {
  ExternalLink,
  Copy,
  Check,
  ChevronRight,
  Unplug,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChainIcon } from "@/components/chain-icon";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAllChainsStats,
  type ChainStats,
} from "@/hooks/use-all-chains-stats";
import { formatEther, shortenAddress } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Link } from "@/i18n/routing";
import type { FenixChainConfig } from "@/config/chains";

function ChainDashboardLink({ chainConfig }: { chainConfig: FenixChainConfig }) {
  const t = useTranslations("nav");
  const { chain, iconSlug } = chainConfig;

  return (
    <Link
      href={{ pathname: "/dashboard", query: { chain: chain.id } }}
      prefetch={false}
      aria-label={`${chain.name} — ${t("dashboard")}`}
      className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground after:absolute after:inset-0 after:z-0 after:rounded-[inherit] hover:text-brand-foreground focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-fenix-500"
    >
      <ChainIcon slug={iconSlug} name={chain.name} size={20} />
      <span className="truncate">{chain.name}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" />
    </Link>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations("nav");
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className="relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500"
      title={t("copy_address")}
      aria-label={copied ? t("copied") : t("copy_address")}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function StatusDot({ status }: { status: ChainStats["status"] }) {
  const t = useTranslations("chain_table");

  // Terminal, not pending: a hollow ring reads as "off" in both themes, where a
  // filled dot that pings would claim the chain is live and still working.
  if (status === "unavailable") {
    return (
      <span
        role="img"
        aria-label={t("unavailable")}
        className="flex h-2.5 w-2.5 rounded-full border-2 border-muted-foreground"
      />
    );
  }

  if (status === "loading") {
    return (
      <span role="img" aria-label={t("loading")} className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground" />
      </span>
    );
  }

  if (status === "error") {
    return (
      <span role="img" aria-label={t("error")} className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
    );
  }

  // Steady, not pinging: a ping says "still working", and a chain that has
  // answered is done. It also keeps ten infinite animations off the page.
  return (
    <span
      role="img"
      aria-label={t("active")}
      className="flex h-2.5 w-2.5 rounded-full bg-emerald-500"
    />
  );
}

/**
 * Contract address plus copy/explorer affordances. Shared by the desktop row and
 * the mobile card, including their unavailable variants -- the deployment is
 * real and worth copying even when no RPC answers for it.
 *
 * `textClassName` is a parameter rather than a constant because the two call
 * sites ship different muted greys today (ash-500 vs ash-600 in light mode);
 * hard-coding either would silently restyle the other.
 */
function AddressCell({
  address,
  addressUrl,
  textClassName,
}: {
  address: `0x${string}`;
  addressUrl: string | undefined;
  textClassName: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className={textClassName}>{shortenAddress(address, 4)}</span>
      <CopyButton text={address} />
      {addressUrl && (
        <a
          href={addressUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={new URL(addressUrl).hostname}
          className="relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

function parseChainStats(stats: ChainStats) {
  const { chainConfig, totalSupply, equityPoolSupply, rewardPoolSupply, shareRate } = stats;
  const chain = chainConfig.chain;

  const equityNum = equityPoolSupply !== undefined
    ? parseFloat(formatEther(equityPoolSupply))
    : undefined;
  const rewardNum = rewardPoolSupply !== undefined
    ? parseFloat(formatEther(rewardPoolSupply))
    : undefined;
  const circulatingNum = totalSupply !== undefined
    ? parseFloat(formatEther(totalSupply))
    : undefined;
  const shareRateNum = shareRate !== undefined
    ? parseFloat(formatEther(shareRate))
    : undefined;

  const explorerUrl = chain.blockExplorers?.default?.url;
  const addressUrl = explorerUrl
    ? `${explorerUrl}/address/${chainConfig.fenixContract}`
    : undefined;

  return { chain, equityNum, rewardNum, circulatingNum, shareRateNum, addressUrl };
}

/**
 * One supply figure in either layout: a skeleton while the chain loads, the
 * animated number once it answers, a muted dash if the read came back empty.
 */
function SupplyValue({
  status,
  value,
  className,
  skeletonClassName,
  digits = 2,
  compact = true,
}: {
  status: ChainStats["status"];
  value: number | undefined;
  className?: string;
  skeletonClassName: string;
  digits?: number;
  compact?: boolean;
}) {
  if (status === "loading") return <Skeleton className={skeletonClassName} />;
  if (value === undefined) return <span className="text-muted-foreground">--</span>;

  const number = (
    <NumberFlow
      value={value}
      format={{
        notation: compact && value > 1_000_000 ? "compact" : "standard",
        maximumFractionDigits: digits,
      }}
      transformTiming={{ duration: 600, easing: "ease-out" }}
    />
  );
  return className ? <span className={className}>{number}</span> : number;
}

function ChainRow({ stats }: { stats: ChainStats }) {
  const t = useTranslations("chain_table");
  const { chainConfig, status } = stats;
  const { equityNum, rewardNum, circulatingNum, shareRateNum, addressUrl } =
    parseChainStats(stats);

  // One explicit statement beats four "--"s: nothing is loading and nothing will
  // arrive, so the four numeric cells collapse into a single sentence.
  if (status === "unavailable") {
    return (
      <tr className="group relative border-b border-ash-100 transition-colors hover:bg-ash-50/50 focus-within:bg-ash-50/50 dark:border-ash-800 dark:hover:bg-ash-800/30 dark:focus-within:bg-ash-800/30">
        <td className="whitespace-nowrap px-3 py-3 text-sm sm:px-4">
          <ChainDashboardLink chainConfig={chainConfig} />
        </td>

        <td className="px-3 py-3 sm:px-4">
          <StatusDot status={status} />
        </td>

        <td
          colSpan={4}
          className="px-3 py-3 text-right text-sm text-muted-foreground sm:px-4"
        >
          <span className="inline-flex items-center gap-1.5">
            <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
            {t("unavailable")}
          </span>
        </td>

        <td className="whitespace-nowrap px-3 py-3 sm:px-4">
          <AddressCell
            address={chainConfig.fenixContract}
            addressUrl={addressUrl}
            textClassName="font-mono text-xs text-muted-foreground"
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="group relative border-b border-ash-100 transition-colors hover:bg-ash-50/50 focus-within:bg-ash-50/50 dark:border-ash-800 dark:hover:bg-ash-800/30 dark:focus-within:bg-ash-800/30">
      {/* Chain */}
      <td className="whitespace-nowrap px-3 py-3 text-sm sm:px-4">
        <ChainDashboardLink chainConfig={chainConfig} />
      </td>

      {/* Status */}
      <td className="px-3 py-3 sm:px-4">
        <StatusDot status={status} />
      </td>

      {/* Equity Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        <SupplyValue
          status={status}
          value={equityNum}
          className="text-foreground"
          skeletonClassName="ml-auto h-5 w-20"
        />
      </td>

      {/* Reward Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        <SupplyValue
          status={status}
          value={rewardNum}
          className="text-foreground"
          skeletonClassName="ml-auto h-5 w-20"
        />
      </td>

      {/* Circulating Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        <SupplyValue
          status={status}
          value={circulatingNum}
          className="text-foreground"
          skeletonClassName="ml-auto h-5 w-20"
        />
      </td>

      {/* Share Rate */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        <SupplyValue
          status={status}
          value={shareRateNum}
          className="text-brand-foreground"
          skeletonClassName="ml-auto h-5 w-16" digits={4} compact={false}
        />
      </td>

      {/* Address */}
      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
        <AddressCell
          address={chainConfig.fenixContract}
          addressUrl={addressUrl}
          textClassName="font-mono text-xs text-muted-foreground"
        />
      </td>
    </tr>
  );
}

// Mobile card view for small screens
function ChainCard({ stats }: { stats: ChainStats }) {
  const t = useTranslations("chain_table");
  const { chainConfig, status } = stats;
  const { equityNum, rewardNum, circulatingNum, shareRateNum, addressUrl } =
    parseChainStats(stats);
  const metrics = [
    { label: "equity_supply", value: equityNum },
    { label: "reward_supply", value: rewardNum },
    { label: "circulating_supply", value: circulatingNum },
    { label: "share_rate", value: shareRateNum },
  ] as const;

  return (
    <Card variant="glow" className="group relative flex min-w-0 flex-col overflow-hidden transition-colors hover:border-fenix-500/40">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <ChainDashboardLink chainConfig={chainConfig} />
          <span className="shrink-0">
            <StatusDot status={status} />
          </span>
        </div>

        {status === "unavailable" ? (
          <div className="flex-1 space-y-1 border-t border-border/60 pt-4">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
              {t("unavailable")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("unavailable_hint")}
            </p>
          </div>
        ) : (
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-4 border-t border-border/60 pt-4">
            {metrics.map(({ label, value }) => (
              <div key={label} className="min-w-0 space-y-1 even:text-end">
                <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                <dd className={`font-mono text-sm font-semibold tabular-nums ${label === "share_rate" ? "text-brand-foreground" : "text-foreground"}`}>
                  <SupplyValue
                    status={status}
                    value={value}
                    compact={label !== "share_rate"}
                    digits={label === "share_rate" ? 4 : 2}
                    skeletonClassName={`h-5 w-16 ${label === "reward_supply" || label === "share_rate" ? "ms-auto" : ""}`}
                  />
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">{t("address")}</span>
          <AddressCell
            address={chainConfig.fenixContract}
            addressUrl={addressUrl}
            textClassName="font-mono text-xs text-foreground-secondary"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function ChainTable() {
  const t = useTranslations("chain_table");
  const { chainsStats } = useAllChainsStats();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Desktop table */}
      <Card variant="glow" className="hidden overflow-hidden lg:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-border bg-ash-50/80 dark:bg-ash-900/50">
                  <TableHead className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("chain")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("status")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("equity_supply")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("reward_supply")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("circulating_supply")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("share_rate")}
                  </TableHead>
                  <TableHead className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground sm:px-4">
                    {t("address")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chainsStats.map((stats) => (
                  <ChainRow key={stats.chainConfig.chain.id} stats={stats} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {chainsStats.map((stats) => (
          <ChainCard key={stats.chainConfig.chain.id} stats={stats} />
        ))}
      </div>
    </section>
  );
}
