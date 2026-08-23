import type { MetadataRoute } from "next";
import { ROUTES } from "@/config/site";
import { LOCALES } from "@/config/constants";
import { alternatesFor, pageUrl } from "@/config/site";

// Emitted as a static out/sitemap.xml by `output: "export"`.
export const dynamic = "force-static";

/**
 * Every locale x route pair, each carrying the full hreflang alternate set so a
 * crawler that finds one language finds all of them. Locale home pages get the
 * higher priority; the rest are equal.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return LOCALES.flatMap((locale) =>
    ROUTES.map((route) => ({
      url: pageUrl(locale, route),
      changeFrequency: "daily" as const,
      priority: route === "" ? 1 : 0.8,
      alternates: { languages: alternatesFor(route) },
    }))
  );
}
