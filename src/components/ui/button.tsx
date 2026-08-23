"use client";

import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-ash-950 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-fenix-500 to-ember-500 text-white shadow-md shadow-fenix-500/25 hover:from-fenix-600 hover:to-ember-600 hover:shadow-lg hover:shadow-fenix-500/30 active:from-fenix-700 active:to-ember-700",
        secondary:
          "bg-ash-100 text-ash-900 hover:bg-ash-200 active:bg-ash-300 dark:bg-ash-800 dark:text-ash-100 dark:hover:bg-ash-700 dark:active:bg-ash-600",
        outline:
          "border border-ash-300 bg-transparent text-ash-900 hover:bg-ash-100 active:bg-ash-200 dark:border-ash-700 dark:text-ash-100 dark:hover:bg-ash-800 dark:active:bg-ash-700",
        ghost:
          "text-ash-900 hover:bg-ash-100 active:bg-ash-200 dark:text-ash-100 dark:hover:bg-ash-800 dark:active:bg-ash-700",
        destructive:
          "bg-ember-500 text-white shadow-md shadow-ember-500/25 hover:bg-ember-600 hover:shadow-lg hover:shadow-ember-500/30 active:bg-ember-700 dark:bg-ember-600 dark:hover:bg-ember-700",
        link: "text-fenix-500 underline-offset-4 hover:underline dark:text-fenix-400",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-xs",
        md: "h-10 px-4 py-2",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10",
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
