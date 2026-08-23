import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LOCALES, type Locale } from "@/config/constants";
import { SITE_URL, alternatesFor, pageUrl, type Route } from "@/config/site";

/**
 * Per-page metadata, localised.
 *
 * Every page used to inherit one static block from the locale layout, so all
 * 105 pages shipped the same title, the same description, no canonical and no
 * hreflang -- 21 translations of the same content with nothing telling a
 * crawler they are translations rather than duplicates.
 */

/**
 * og:locale wants language_TERRITORY, not a bare language tag. These are the
 * conventional pairings for the locales the site ships; where a language spans
 * several territories the largest audience wins, which is all Open Graph does
 * with the value anyway.
 */
const OG_LOCALES: Record<Locale, string> = {
  en: "en_US",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  it: "it_IT",
  pt: "pt_BR",
  ja: "ja_JP",
  ko: "ko_KR",
  zh: "zh_CN",
  ar: "ar_AR",
  hi: "hi_IN",
  ru: "ru_RU",
  tr: "tr_TR",
  vi: "vi_VN",
  th: "th_TH",
  id: "id_ID",
  pl: "pl_PL",
  nl: "nl_NL",
  uk: "uk_UA",
  he: "he_IL",
  fa: "fa_IR",
};

/** The X account, as a handle. Derived so it cannot drift from SOCIAL_LINKS. */
export const TWITTER_HANDLE = "@fenix_protocol";

/** Which message keys supply the title and description for each route. */
const ROUTE_COPY: Record<Route, { namespace: string; description: string }> = {
  // The home page's own `metadata.description` is only 43 characters, which is
  // thin for a search snippet; the hero subtitle says the same thing properly.
  "": { namespace: "metadata", description: "hero.subtitle" },
  dashboard: { namespace: "dashboard", description: "dashboard.description" },
  burn: { namespace: "burn", description: "burn.description" },
  stake: { namespace: "stake", description: "stake.description" },
  rewards: { namespace: "rewards", description: "rewards.description" },
};

/**
 * The Open Graph card.
 *
 * A real `.png` rather than Next's `opengraph-image` route: that route emits a
 * file with no extension, and GitHub Pages types static files purely by
 * extension, so the card went out as `application/octet-stream` -- which
 * Facebook, X, LinkedIn, Slack and Discord all refuse. Regenerate the file with
 * `bun run gen:og`.
 */
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Fenix Protocol — Burn XEN, Stake FENIX, Earn Trustless Yield",
} as const;

/** The message keys a route's title and description come from. */
export function copyKeysFor(route: Route): {
  title: string;
  description: string;
} {
  const copy = ROUTE_COPY[route];
  return { title: `${copy.namespace}.title`, description: copy.description };
}

/**
 * The metadata block for one locale + route, given its already-resolved copy.
 *
 * Split from `buildPageMetadata` so the shape is testable: `getTranslations` is
 * server-only and throws under the jsdom test environment, which would leave
 * the canonical and hreflang wiring uncovered.
 */
export function buildMetadata(
  locale: string,
  route: Route,
  { title, description }: { title: string; description: string }
): Metadata {
  const url = pageUrl(locale, route);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: alternatesFor(route),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Fenix Protocol",
      type: "website",
      locale: OG_LOCALES[locale as Locale] ?? "en_US",
      // Tells a crawler the other translations exist without making it walk
      // the hreflang set.
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALES[l]
      ),
      // Repeated per page rather than inherited: a page's openGraph block
      // replaces the layout's outright, so omitting it here drops the card.
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      images: [OG_IMAGE],
    },
  };
}

/**
 * Server-side entry point: resolves the route's copy in the requested locale,
 * then hands off to `buildMetadata`. Called from each page's generateMetadata.
 */
export async function buildPageMetadata(
  locale: string,
  route: Route
): Promise<Metadata> {
  const keys = copyKeysFor(route);
  const t = await getTranslations({ locale });

  return buildMetadata(locale, route, {
    title: t(keys.title),
    description: t(keys.description),
  });
}

/** Absolute canonical for the site root, used by the root landing page. */
export const ROOT_URL = `${SITE_URL}/`;
