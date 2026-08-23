"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { useField } from "./field";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, id, ...props }, ref) => {
    const field = useField();
    // Minted unconditionally so an Input outside a Field is still addressable;
    // an explicit `id` prop always wins, then the enclosing Field's id.
    const fallbackId = React.useId();
    const resolvedId = id ?? field?.controlId ?? fallbackId;

    return (
      <input
        id={resolvedId}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-ash-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fenix-500/50 focus-visible:border-fenix-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:placeholder:text-ash-500",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
