"use client";

import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-fenix-500 to-ember-500 text-white shadow-md shadow-fenix-500/25 hover:from-fenix-600 hover:to-ember-600 hover:shadow-lg hover:shadow-fenix-500/30 active:from-fenix-700 active:to-ember-700",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-ash-200 active:bg-ash-300 dark:hover:bg-ash-700 dark:active:bg-ash-600",
        // The tier between `default` and `secondary`: brand hue, but tinted
        // rather than filled, so it reads as the brand action without putting a
        // second gradient fill on screen next to a page's own primary CTA.
        // text-brand-foreground is the AA-checked brand text tier:
        // 4.64:1 on the light tint, ~8:1 on the dark one.
        brand:
          "border border-fenix-500/40 bg-fenix-500/10 text-brand-foreground hover:border-fenix-500/60 hover:bg-fenix-500/15 active:bg-fenix-500/25",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-accent active:bg-ash-200 dark:active:bg-ash-700",
        ghost:
          "text-foreground hover:bg-accent active:bg-ash-200 dark:active:bg-ash-700",
        // Tinted rather than filled, mirroring alert.tsx's destructive language.
        // A saturated ember fill read as a flatter twin of the fenix->ember
        // primary gradient; weight, not hue, is what separates danger from brand.
        destructive:
          "border border-ember-300 bg-ember-50 text-ember-700 hover:border-ember-400 hover:bg-ember-100 active:bg-ember-200 dark:border-ember-800 dark:bg-ember-950/40 dark:text-ember-400 dark:hover:border-ember-700 dark:hover:bg-ember-950/60 dark:active:bg-ember-900/50",
        link: "text-fenix-500 underline-offset-4 hover:underline dark:text-fenix-400",
      },
      // Per-size minimum widths (~2-2.7x the height) so short labels such as
      // "Next" stop sizing raggedly next to longer ones. Deliberately per-size:
      // one blanket value would stretch `icon` into a rectangle and push the
      // in-input "Max" button (size="sm") over the amount it sits on top of.
      size: {
        sm: "h-8 min-w-16 rounded-md px-3 text-xs",
        md: "h-10 min-w-24 px-4 py-2",
        lg: "h-12 min-w-32 rounded-xl px-6 text-base",
        icon: "h-10 min-w-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("animate-spin", className)} />;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref
  ) => {
    if (asChild) {
      return (
        <SlotPrimitive.Root
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </SlotPrimitive.Root>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner className="size-4" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
