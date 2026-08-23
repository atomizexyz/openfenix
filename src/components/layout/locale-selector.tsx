"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/config/constants";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LocaleSelectorProps {
  /** Which edge the menu lines up with. Use "start" on the left of a layout. */
  align?: "start" | "end";
  /** Show the locale code beside the globe. Hidden on small screens by default. */
  label?: "responsive" | "always";
}

export function LocaleSelector({
  align = "end",
  label = "responsive",
}: LocaleSelectorProps = {}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleLocaleChange(newLocale: Locale) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-foreground-secondary transition-colors hover:bg-accent"
          aria-label="Change language"
        >
          <Globe className="h-4 w-4" />
          <span className={cn(label === "responsive" && "hidden sm:inline")}>
            {locale.toUpperCase()}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="max-h-80 w-48 overflow-y-auto rounded-xl border-ash-200 bg-popover shadow-lg dark:border-ash-700"
      >
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => handleLocaleChange(l)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
              l === locale
                ? "bg-fenix-500/10 text-fenix-600 dark:text-fenix-400"
                : "text-ash-700 hover:bg-accent focus:bg-accent dark:text-ash-300"
            )}
          >
            <span>{LOCALE_NAMES[l]}</span>
            <span className="text-xs text-ash-400">{l.toUpperCase()}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
