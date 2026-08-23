"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ChainIconProps {
  /** FenixChainConfig.iconSlug — matches public/images/chains/<slug>.webp */
  slug: string;
  name: string;
  size?: number;
  className?: string;
}

export function ChainIcon({ slug, name, size = 24, className }: ChainIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        aria-label={name}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ash-200 to-ash-300 font-bold text-ash-700 dark:from-ash-700 dark:to-ash-600 dark:text-ash-200",
          className
        )}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      >
        {name.charAt(0)}
      </span>
    );
  }

  return (
    // Local static asset; next/image adds nothing with unoptimized images.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/chains/${slug}.webp`}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
