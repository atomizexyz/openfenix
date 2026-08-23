"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { FENIX_CHAINS } from "@/config/chains";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChainIcon } from "@/components/chain-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ChainSelector() {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const currentChain = FENIX_CHAINS.find((c) => c.chain.id === chain?.id);

  if (!chain) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-lg border border-ash-200 px-2.5 py-1.5 text-sm font-medium text-ash-700 transition-colors hover:bg-accent dark:border-ash-700 dark:text-ash-300">
          {currentChain ? (
            <ChainIcon
              slug={currentChain.iconSlug}
              name={currentChain.chain.name}
              size={16}
            />
          ) : (
            <span className="h-4 w-4 rounded-full bg-gradient-to-br from-fenix-400 to-fenix-600" />
          )}
          <span className="hidden sm:inline">
            {currentChain?.chain.name || "Unknown"}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl border-ash-200 bg-popover shadow-lg dark:border-ash-700"
      >
        {FENIX_CHAINS.filter((c) => c.enabled).map((config) => (
          <DropdownMenuItem
            key={config.chain.id}
            onClick={() => {
              switchChain({ chainId: config.chain.id });
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              config.chain.id === chain?.id
                ? "bg-fenix-500/10 text-fenix-600 dark:text-fenix-400"
                : "text-ash-700 hover:bg-accent focus:bg-accent dark:text-ash-300"
            )}
          >
            <ChainIcon
              slug={config.iconSlug}
              name={config.chain.name}
              size={24}
            />
            <span>{config.chain.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
