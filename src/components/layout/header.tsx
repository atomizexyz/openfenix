"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/routing";
import { ConnectKitButton } from "connectkit";
import { useDisconnect } from "wagmi";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X, LogOut, Copy, Check, ExternalLink } from "lucide-react";
import { FenixLogo, FenixWordmark } from "@/components/icons";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { ChainSelector } from "@/components/wallet/chain-selector";
import { WalletQR } from "@/components/wallet/wallet-qr";
import { LocaleSelector } from "@/components/layout/locale-selector";

function WalletButton() {
  const t = useTranslations("nav");
  const { disconnect } = useDisconnect();
  const { copied, copy } = useCopyToClipboard();

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName, address }) => {
        if (!isConnected) {
          return (
            <button
              onClick={show}
              className="rounded-xl bg-gradient-to-r from-fenix-500 to-ember-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-fenix-500/25 transition-all hover:shadow-fenix-500/40"
            >
              {t("connect")}
            </button>
          );
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-xl border border-ash-200 bg-white px-4 py-2 text-sm font-medium text-ash-900 transition-all hover:bg-ash-50 dark:border-ash-700 dark:bg-ash-800 dark:text-ash-100 dark:hover:bg-ash-700">
                {ensName || truncatedAddress}
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              {address && (
                <DropdownMenuItem onClick={() => copy(address)}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? t("copied") : t("copy_address")}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={() => show?.()}>
                <ExternalLink className="h-4 w-4" />
                {t("wallet_details")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleDisconnect}
                className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:text-red-400 dark:focus:bg-red-950/30 dark:focus:text-red-400"
              >
                <LogOut className="h-4 w-4 text-red-600 dark:text-red-400" />
                {t("disconnect")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/burn", label: t("burn") },
    { href: "/stake", label: t("stake") },
    { href: "/rewards", label: t("rewards") },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b border-ash-200/50 bg-white/80 backdrop-blur-xl dark:border-ash-800/50 dark:bg-ash-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <FenixLogo className="h-9 w-9" />
          <FenixWordmark className="hidden h-5 w-auto text-ash-900 dark:text-ash-100 sm:block" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-fenix-500/10 text-fenix-600 dark:text-fenix-400"
                  : "text-ash-600 hover:bg-ash-100 hover:text-ash-900 dark:text-ash-400 dark:hover:bg-ash-800 dark:hover:text-ash-100"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <LocaleSelector />
          <ChainSelector />
          <WalletQR />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-ash-600 transition-colors hover:bg-ash-100 dark:text-ash-400 dark:hover:bg-ash-800"
            aria-label="Toggle theme"
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="block h-4 w-4 dark:hidden" />
          </button>

          <WalletButton />

          {/* Mobile menu button */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="rounded-lg p-2 text-ash-600 md:hidden dark:text-ash-400">
                {mobileOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </SheetTrigger>

            {/* Mobile Nav */}
            <SheetContent
              side="top"
              aria-label="Menu"
              className="border-ash-200 bg-white px-4 py-3 dark:border-ash-800 dark:bg-ash-950 md:hidden"
            >
              <nav className="flex flex-col gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      pathname === item.href
                        ? "bg-fenix-500/10 text-fenix-600 dark:text-fenix-400"
                        : "text-ash-600 hover:bg-ash-100 dark:text-ash-400 dark:hover:bg-ash-800"
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
