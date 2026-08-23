"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type FieldContextValue = {
  /**
   * Id to place on the field's control. `undefined` when the control is not a
   * labelable element (see `labelable` below), so that `Label` never emits an
   * `htmlFor` pointing at an id that does not exist.
   */
  controlId: string | undefined;
  /** Id of the `Label` element, for `aria-labelledby` on non-labelable widgets. */
  labelId: string;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

/**
 * Returns the ids minted by the nearest `Field` ancestor, or `null` when the
 * component is rendered outside one. `Label`, `Input` (and any future control)
 * read this so a caller only has to wrap the group — the label and the control
 * do not have to be siblings, nested, or in any particular order.
 */
function useField(): FieldContextValue | null {
  return React.useContext(FieldContext);
}

type FieldProps = React.ComponentProps<"div"> & {
  /**
   * Whether the field's control is a labelable element (`input`, `select`,
   * `textarea`, …). Set `false` for widgets that `htmlFor` cannot target — a
   * Radix `Slider`, for example, renders no labelable element. The `Label` then
   * emits only its own `id`, and the widget reads `labelId` off this context
   * and emits `aria-labelledby` itself. `Slider` (`ui/slider.tsx`) does exactly
   * that, on its thumb — the element that carries `role="slider"`.
   */
  labelable?: boolean;
};

/**
 * Groups a `Label` with its control and associates the two.
 *
 * Drop-in for the `<div className="space-y-2">` wrapper forms already use:
 * the default spacing matches, and `className` still overrides it (tailwind-merge
 * dedupes the `space-y` group, so `space-y-3` wins).
 */
function Field({ className, labelable = true, ...props }: FieldProps) {
  const uid = React.useId();
  const value = React.useMemo<FieldContextValue>(
    () => ({
      controlId: labelable ? `${uid}-control` : undefined,
      labelId: `${uid}-label`,
    }),
    [uid, labelable]
  );

  return (
    <FieldContext.Provider value={value}>
      <div data-slot="field" className={cn("space-y-2", className)} {...props} />
    </FieldContext.Provider>
  );
}

export { Field, useField };
export type { FieldContextValue, FieldProps };
