"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useField } from "./field"

function Label({
  className,
  htmlFor,
  id,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const field = useField()

  return (
    <LabelPrimitive.Root
      data-slot="label"
      // Explicit props win; otherwise the enclosing Field supplies both. When the
      // Field is marked `labelable={false}` its `controlId` is undefined, so no
      // `htmlFor` is emitted; the widget instead reads `labelId` off the Field
      // context and points its own `aria-labelledby` at the id emitted here.
      id={id ?? field?.labelId}
      htmlFor={htmlFor ?? field?.controlId}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
