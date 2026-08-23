"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { FENIX_CHAINS, getChainConfig } from "@/config/chains";
import { ChainIcon } from "@/components/chain-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardChainSelectorProps {
  chainId: number;
  onChainChange: (chainId: number) => void;
}

const dashboardChains = FENIX_CHAINS.filter((config) => config.enabled);

export function DashboardChainSelector({
  chainId,
  onChainChange,
}: DashboardChainSelectorProps) {
  const t = useTranslations("common");
  const currentConfig = getChainConfig(chainId);
  const currentChain = currentConfig?.chain;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("chain")}: ${currentChain?.name ?? t("chain")}`}
          className="group inline-flex min-w-44 items-center justify-between gap-3 rounded-xl border border-ash-200 bg-card px-3 py-2 text-sm font-medium text-ash-700 shadow-sm transition-colors hover:border-ash-300 hover:bg-ash-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500/50 dark:border-ash-700 dark:text-ash-300 dark:hover:border-ash-600 dark:hover:bg-ash-800"
        >
          <span className="flex min-w-0 items-center gap-2">
            {currentConfig ? (
              <ChainIcon
                slug={currentConfig.iconSlug}
                name={currentConfig.chain.name}
                size={16}
              />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full bg-gradient-to-br from-fenix-400 to-fenix-600" />
            )}
            <span className="truncate">{currentChain?.name ?? t("chain")}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ash-400 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-80 w-64 rounded-xl border-ash-200 bg-card p-1.5 shadow-lg dark:border-ash-700"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t("chain")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(chainId)}
          onValueChange={(value) => onChainChange(Number(value))}
        >
          {dashboardChains.map((config) => (
            <DropdownMenuRadioItem
              key={config.chain.id}
              value={String(config.chain.id)}
              className="rounded-lg py-2.5 pr-3 text-ash-700 focus:bg-accent focus:text-accent-foreground dark:text-ash-300"
            >
              <ChainIcon
                slug={config.iconSlug}
                name={config.chain.name}
                size={24}
              />
              <span className="truncate">{config.chain.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
