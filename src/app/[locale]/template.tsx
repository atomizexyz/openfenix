import type { ReactNode } from "react";

// The exported HTML must be visible before hydration, including when scripts
// fail to load. A route-wide opacity animation delayed every page's first paint.
export default function LocaleTemplate({ children }: { children: ReactNode }) {
  return children;
}
