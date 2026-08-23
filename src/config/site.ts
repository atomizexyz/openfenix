import { LOCALES, DEFAULT_LOCALE } from "@/config/constants";

/**
 * Canonical origin. The site is a static export served from GitHub Pages at
 * this apex domain (see public/CNAME), so every machine-readable file --
 * sitemap.xml, robots.txt, llms.txt -- has to spell out absolute URLs itself;
 * there is no server to resolve relative ones.
 */
export const SITE_URL = "https://fenix.fyi";

/** Route segments under each locale. "" is the locale home page. */
export const ROUTES = ["", "dashboard", "burn", "stake", "rewards"] as const;

export type Route = (typeof ROUTES)[number];

/**
 * Absolute URL for a locale + route. `trailingSlash: true` in next.config.ts
 * means GitHub Pages resolves /en/burn/ to /en/burn/index.html, so the trailing
 * slash is load-bearing -- without it Pages issues a redirect.
 */
export function pageUrl(locale: string, route: Route = ""): string {
  return route
    ? `${SITE_URL}/${locale}/${route}/`
    : `${SITE_URL}/${locale}/`;
}

/** Every indexable page, in a stable order (locale-major, route-minor). */
export function allPages(): { locale: string; route: Route; url: string }[] {
  return LOCALES.flatMap((locale) =>
    ROUTES.map((route) => ({ locale, route, url: pageUrl(locale, route) }))
  );
}

/**
 * hreflang map for one route across every locale, plus x-default pointing at
 * the default locale.
 */
export function alternatesFor(route: Route): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = pageUrl(locale, route);
  }
  languages["x-default"] = pageUrl(DEFAULT_LOCALE, route);
  return languages;
}
