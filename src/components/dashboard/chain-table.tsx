"use client";

import { useTranslations } from "next-intl";
import NumberFlow from "@number-flow/react";
import {
  ExternalLink,
  Copy,
  Check,
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

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      onClick={() => copy(text)}
      className="inline-flex items-center text-ash-400 transition-colors hover:text-fenix-500"
      title="Copy address"
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
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ash-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ash-400" />
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

  return (
    <span role="img" aria-label={t("active")} className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
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
    <div className="flex items-center gap-1.5">
      <span className={textClassName}>{shortenAddress(address, 4)}</span>
      <CopyButton text={address} />
      {addressUrl && (
        <a
          href={addressUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ash-400 transition-colors hover:text-fenix-500"
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

function ChainRow({ stats }: { stats: ChainStats }) {
  const t = useTranslations("chain_table");
  const { chainConfig, status } = stats;
  const { chain, equityNum, rewardNum, circulatingNum, shareRateNum, addressUrl } =
    parseChainStats(stats);

  // One explicit statement beats four "--"s: nothing is loading and nothing will
  // arrive, so the four numeric cells collapse into a single sentence.
  if (status === "unavailable") {
    return (
      <tr className="border-b border-ash-100 dark:border-ash-800">
        <td className="whitespace-nowrap px-3 py-3 sm:px-4">
          <span className="text-sm font-semibold text-muted-foreground">
            {chain.name}
          </span>
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
    <tr className="border-b border-ash-100 transition-colors hover:bg-ash-50/50 dark:border-ash-800 dark:hover:bg-ash-800/30">
      {/* Chain */}
      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <ChainIcon slug={chainConfig.iconSlug} name={chain.name} size={20} />
          <span className="text-sm font-semibold text-foreground">
            {chain.name}
          </span>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3 sm:px-4">
        <StatusDot status={status} />
      </td>

      {/* Equity Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        {status === "loading" ? (
          <Skeleton className="ml-auto h-5 w-20" />
        ) : equityNum !== undefined ? (
          <span className="text-foreground">
            <NumberFlow
              value={equityNum}
              format={{
                notation: equityNum > 1_000_000 ? "compact" : "standard",
                maximumFractionDigits: 2,
              }}
              transformTiming={{ duration: 600, easing: "ease-out" }}
            />
          </span>
        ) : (
          <span className="text-ash-400">--</span>
        )}
      </td>

      {/* Reward Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        {status === "loading" ? (
          <Skeleton className="ml-auto h-5 w-20" />
        ) : rewardNum !== undefined ? (
          <span className="text-foreground">
            <NumberFlow
              value={rewardNum}
              format={{
                notation: rewardNum > 1_000_000 ? "compact" : "standard",
                maximumFractionDigits: 2,
              }}
              transformTiming={{ duration: 600, easing: "ease-out" }}
            />
          </span>
        ) : (
          <span className="text-ash-400">--</span>
        )}
      </td>

      {/* Circulating Supply */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        {status === "loading" ? (
          <Skeleton className="ml-auto h-5 w-20" />
        ) : circulatingNum !== undefined ? (
          <span className="text-foreground">
            <NumberFlow
              value={circulatingNum}
              format={{
                notation: circulatingNum > 1_000_000 ? "compact" : "standard",
                maximumFractionDigits: 2,
              }}
              transformTiming={{ duration: 600, easing: "ease-out" }}
            />
          </span>
        ) : (
          <span className="text-ash-400">--</span>
        )}
      </td>

      {/* Share Rate */}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm sm:px-4">
        {status === "loading" ? (
          <Skeleton className="ml-auto h-5 w-16" />
        ) : shareRateNum !== undefined ? (
          <span className="text-brand-foreground">
            <NumberFlow
              value={shareRateNum}
              format={{ maximumFractionDigits: 4 }}
              transformTiming={{ duration: 600, easing: "ease-out" }}
            />
          </span>
        ) : (
          <span className="text-ash-400">--</span>
        )}
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
  const { chain, equityNum, rewardNum, circulatingNum, shareRateNum, addressUrl } =
    parseChainStats(stats);

  // Same terminal state as the desktop row: say why there are no numbers rather
  // than showing a grid of dashes.
  if (status === "unavailable") {
    return (
      <Card variant="glow" className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">
                {chain.name}
              </span>
            </div>
            <StatusDot status={status} />
          </div>

          <div className="mt-3 space-y-1">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
              {t("unavailable")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("unavailable_hint")}
            </p>
          </div>

          <div className="mt-3">
            <p className="text-xs text-muted-foreground">
              {t("address")}
            </p>
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

  return (
    <Card variant="glow" className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChainIcon slug={chainConfig.iconSlug} name={chain.name} size={20} />
            <span className="font-semibold text-foreground">
              {chain.name}
            </span>
          </div>
          <StatusDot status={status} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("equity_supply")}
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {status === "loading" ? (
                <Skeleton className="h-5 w-16" />
              ) : equityNum !== undefined ? (
                <NumberFlow
                  value={equityNum}
                  format={{
                    notation: equityNum > 1_000_000 ? "compact" : "standard",
                    maximumFractionDigits: 2,
                  }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />
              ) : (
                "--"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("reward_supply")}
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {status === "loading" ? (
                <Skeleton className="h-5 w-16" />
              ) : rewardNum !== undefined ? (
                <NumberFlow
                  value={rewardNum}
                  format={{
                    notation: rewardNum > 1_000_000 ? "compact" : "standard",
                    maximumFractionDigits: 2,
                  }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />
              ) : (
                "--"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("circulating_supply")}
            </p>
            <p className="font-mono text-sm font-semibold text-foreground">
              {status === "loading" ? (
                <Skeleton className="h-5 w-16" />
              ) : circulatingNum !== undefined ? (
                <NumberFlow
                  value={circulatingNum}
                  format={{
                    notation: circulatingNum > 1_000_000 ? "compact" : "standard",
                    maximumFractionDigits: 2,
                  }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />
              ) : (
                "--"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("share_rate")}
            </p>
            <p className="font-mono text-sm font-semibold text-brand-foreground">
              {status === "loading" ? (
                <Skeleton className="h-5 w-12" />
              ) : shareRateNum !== undefined ? (
                <NumberFlow
                  value={shareRateNum}
                  format={{ maximumFractionDigits: 4 }}
                  transformTiming={{ duration: 600, easing: "ease-out" }}
                />
              ) : (
                "--"
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t("address")}
            </p>
            <AddressCell
              address={chainConfig.fenixContract}
              addressUrl={addressUrl}
              textClassName="font-mono text-xs text-foreground-secondary"
            />
          </div>
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
      <div className="text-center">
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
