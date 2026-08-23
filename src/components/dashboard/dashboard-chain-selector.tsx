"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { FENIX_CHAINS, getChainConfig } from "@/config/chains";
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
  const currentChain = getChainConfig(chainId)?.chain;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("chain")}: ${currentChain?.name ?? t("chain")}`}
          className="group inline-flex min-w-44 items-center justify-between gap-3 rounded-xl border border-ash-200 bg-white px-3 py-2 text-sm font-medium text-ash-700 shadow-sm transition-colors hover:border-ash-300 hover:bg-ash-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500/50 dark:border-ash-700 dark:bg-ash-900 dark:text-ash-300 dark:hover:border-ash-600 dark:hover:bg-ash-800"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded-full bg-gradient-to-br from-fenix-400 to-fenix-600" />
            <span className="truncate">{currentChain?.name ?? t("chain")}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ash-400 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-80 w-64 rounded-xl border-ash-200 bg-white p-1.5 shadow-lg dark:border-ash-700 dark:bg-ash-900"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-ash-500 dark:text-ash-400">
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
              className="rounded-lg py-2.5 pr-3 text-ash-700 focus:bg-ash-100 focus:text-ash-900 dark:text-ash-300 dark:focus:bg-ash-800 dark:focus:text-ash-100"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ash-200 to-ash-300 text-xs font-bold text-ash-700 dark:from-ash-700 dark:to-ash-600 dark:text-ash-200">
                {config.chain.name.charAt(0)}
              </span>
              <span className="truncate">{config.chain.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
