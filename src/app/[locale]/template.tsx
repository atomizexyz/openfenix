"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * MOT-1: route changes were hard cuts. A `template` (rather than a `layout`)
 * remounts on every navigation, which is what gives the enter animation
 * something to run on -- App Router has no exit phase for a page it has already
 * unmounted, so this is an enter-only drill: the incoming page rises 8px and
 * fades in over 220ms.
 *
 * Deliberately small: it sits above the per-section entrance animations the
 * hero and features sections already run, so anything longer would read as lag
 * on the two utility pages that render instantly.
 *
 * `useReducedMotion` drops both the offset and the fade rather than merely
 * shortening them (WCAG 2.3.3). Nothing inside is `position: fixed` -- the only
 * fixed elements are the dialog and sheet overlays, which portal to `body`, and
 * the sticky header, which lives in the layout above this wrapper -- so the
 * transform here creates no containing block that would break them.
 */
export default function LocaleTemplate({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
