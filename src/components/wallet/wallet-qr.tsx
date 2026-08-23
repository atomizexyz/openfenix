"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import { Cuer } from "cuer";
import { QrCode, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FenixLogo } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export function WalletQR() {
  const t = useTranslations("common");
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const { copied, copy } = useCopyToClipboard();

  if (!isConnected || !address) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="text-ash-600 dark:text-ash-400"
        aria-label="Show QR code"
      >
        <QrCode className="h-4 w-4" />
      </Button>

      {/* max-h + overflow keeps the code fully on screen (and so centered) on
          short viewports, where the taller stacked layout used to clip. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto rounded-2xl border-ash-200 bg-white shadow-2xl dark:border-ash-700 dark:bg-ash-900">
        <div className="flex flex-col items-center gap-5">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-center text-ash-900 dark:text-ash-100">
              {t("wallet_address")}
            </DialogTitle>
            <DialogDescription className="text-center text-ash-500 dark:text-ash-400">
              {t("scan_to_send")}
            </DialogDescription>
          </DialogHeader>

          <WalletAddressLockup address={address} copied={copied} onCopy={copy} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The QR + vertical address lockup. The whole surface is the copy target, so a
 * tap anywhere on the code or the address copies. A div (not a button) because
 * the copy hint is flow content, which a button may not contain.
 */
export function WalletAddressLockup({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const t = useTranslations("common");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCopy(address)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy(address);
        }
      }}
      aria-label={`${t("copy")} ${address}`}
      className="flex w-full cursor-pointer flex-col items-center gap-4 rounded-2xl p-2 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-fenix-500 active:opacity-80"
    >
      <div className="flex w-full items-center justify-evenly gap-3">
        {/* Deliberately NOT theme-flipped: the tile stays white with black
            cells in dark mode too. An inverted QR is off-spec (the standard
            expects dark-on-light) and some wallet cameras refuse it, which for
            a receive address means funds that never arrive. */}
        <div className="grid aspect-square w-[clamp(112px,38vw,176px)] shrink-0 rounded-2xl bg-white p-2 text-black [&_svg]:block [&_svg]:size-full">
          <Cuer
            value={address}
            size={176}
            color="currentColor"
            errorCorrection="high"
            arena={
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-fenix-500 to-ember-500">
                <FenixLogo className="h-5 w-5" />
              </div>
            }
          >
            <Cuer.Finder radius={0.5} />
            <Cuer.Cells radius={1} />
          </Cuer>
        </div>

        <AddressColumn address={address} />
      </div>

      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium transition-colors",
          copied
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-ash-500 dark:text-ash-400"
        )}
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" />
            {t("copied")}
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            {t("copy")}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * The address as a column of fixed-width chunks — 6 chars x 7 rows for an EVM
 * address, a narrower 4-char grid at a smaller size for anything else. The
 * leading anchor and trailing 4 chars are bold and the middle is faded, which
 * is the pair of ends wallets show you to eyeball a match.
 */
function AddressColumn({ address }: { address: string }) {
  const isEvm = address.startsWith("0x");
  const chunkSize = isEvm ? 6 : 4;
  const hiStart = isEvm ? 6 : 4;
  const hiEnd = address.length - 4;

  const chunks: string[] = [];
  for (let i = 0; i < address.length; i += chunkSize) {
    chunks.push(address.slice(i, i + chunkSize));
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col font-mono tracking-wide tabular-nums",
        isEvm
          ? "text-[clamp(14px,4.4vw,19px)] leading-[1.12]"
          : "text-[clamp(10px,3.2vw,14px)] leading-[1.16]"
      )}
    >
      {chunks.map((chunk, chunkIdx) => (
        <span key={chunkIdx}>
          {Array.from(chunk).map((ch, i) => {
            const globalIdx = chunkIdx * chunkSize + i;
            const highlighted = globalIdx < hiStart || globalIdx >= hiEnd;
            return (
              <span
                key={i}
                className={
                  highlighted
                    ? "font-semibold text-ash-900 dark:text-ash-100"
                    : "font-medium text-ash-900/25 dark:text-ash-100/25"
                }
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
