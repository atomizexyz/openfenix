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
import { Button } from "@/components/ui/button";
import { ChainSelector } from "@/components/wallet/chain-selector";
import { WalletQR } from "@/components/wallet/wallet-qr";

/**
 * The header wallet control. Deliberately NOT the `default` (brand gradient)
 * button variant: the header is persistent chrome on every screen, so a
 * gradient here would tie with each page's own primary CTA -- the hero's "Burn
 * XEN", then "Burn XEN"/"Start Stake"/"Claim" on the three utility pages --
 * and leave two equally-weighted brand fills competing (BTN-1).
 *
 * It is not demoted to a neutral fill either: connecting is the gate on every
 * other action, so on the dashboard, which has no page-level CTA of its own, a
 * grey `secondary` would make the most important control the quietest thing on
 * screen. `brand` keeps the brand hue and a visible edge one tier below the
 * gradient. Once connected the control is a status chip and menu rather than a
 * call to action, so it drops to `outline`.
 */
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
            <Button variant="brand" onClick={show}>
              {t("connect")}
            </Button>
          );
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{ensName || truncatedAddress}</Button>
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
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <FenixLogo className="h-9 w-9" />
          <FenixWordmark className="hidden h-5 w-auto text-foreground sm:block" />
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
                  : "text-foreground-secondary hover:bg-accent hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <ChainSelector />
          <WalletQR />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg p-2 text-foreground-secondary transition-colors hover:bg-accent"
            aria-label="Toggle theme"
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="block h-4 w-4 dark:hidden" />
          </button>

          <WalletButton />

          {/* Mobile menu button */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="rounded-lg p-2 text-foreground-secondary md:hidden">
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
              className="border-border bg-background px-4 py-3 md:hidden"
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
                        : "text-foreground-secondary hover:bg-accent"
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
