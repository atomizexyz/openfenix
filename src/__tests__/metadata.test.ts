import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LOCALES, DEFAULT_LOCALE } from "@/config/constants";
import { ROUTES, pageUrl, type Route } from "@/config/site";
import { buildMetadata, copyKeysFor, TWITTER_HANDLE } from "@/lib/metadata";

/**
 * Guards the per-page metadata contract. Every page used to ship the same
 * title, no canonical and no hreflang, so these assert the things a regression
 * would silently undo: titles differ per route, canonicals are
 * self-referencing, the hreflang set is complete, and the copy is translated.
 *
 * `buildPageMetadata` itself is not exercised here -- it calls the server-only
 * `getTranslations`, which throws under jsdom. Instead the message JSON is read
 * directly and fed to the pure `buildMetadata`, which also proves the keys in
 * `copyKeysFor` resolve in every locale.
 */

const projectRoot = resolve(__dirname, "..", "..");

function messagesFor(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(
    readFileSync(resolve(projectRoot, "messages", `${locale}.json`), "utf8")
  );
}

/** Resolves a dotted message key the way next-intl would. */
function lookup(messages: ReturnType<typeof messagesFor>, key: string): string {
  const [namespace, name] = key.split(".");
  const value = messages[namespace]?.[name];
  if (typeof value !== "string") {
    throw new Error(`missing message key: ${key}`);
  }
  return value;
}

function metaFor(locale: string, route: Route) {
  const messages = messagesFor(locale);
  const keys = copyKeysFor(route);
  return buildMetadata(locale, route, {
    title: lookup(messages, keys.title),
    description: lookup(messages, keys.description),
  });
}

// Search engines truncate around here. Not hard limits, but a description that
// blows past them is a mistake worth failing on.
const MAX_DESCRIPTION = 200;

describe("page metadata", () => {
  it("resolves title and description keys in all 21 locales", () => {
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        expect(() => metaFor(locale, route)).not.toThrow();
      }
    }
  });

  it("gives every route its own title", () => {
    const titles = ROUTES.map(
      (route) => metaFor(DEFAULT_LOCALE, route).title as string
    );
    expect(new Set(titles).size).toBe(ROUTES.length);
    for (const title of titles) expect(title.length).toBeGreaterThan(0);
  });

  it("sets a self-referencing canonical per locale and route", () => {
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        expect(metaFor(locale, route).alternates?.canonical).toBe(
          pageUrl(locale, route)
        );
      }
    }
  });

  it("lists every locale plus x-default in hreflang", () => {
    const languages = metaFor("ja", "stake").alternates?.languages ?? {};
    for (const locale of LOCALES) {
      expect(languages[locale]).toBe(pageUrl(locale, "stake"));
    }
    expect(languages["x-default"]).toBe(pageUrl(DEFAULT_LOCALE, "stake"));
    expect(Object.keys(languages)).toHaveLength(LOCALES.length + 1);
  });

  it("points og:url at the page itself, not the site root", () => {
    expect(metaFor("de", "burn").openGraph?.url).toBe(pageUrl("de", "burn"));
  });

  it("localises og:locale and lists the rest as alternates", () => {
    const og = metaFor("ja", "").openGraph as {
      locale?: string;
      alternateLocale?: string[];
    };
    expect(og.locale).toBe("ja_JP");
    expect(og.alternateLocale).toHaveLength(LOCALES.length - 1);
    expect(og.alternateLocale).not.toContain("ja_JP");
    // Open Graph wants language_TERRITORY, not a bare language tag.
    for (const alt of og.alternateLocale ?? []) {
      expect(alt).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });

  it("gives every locale an og:locale of its own", () => {
    const seen = LOCALES.map(
      (locale) =>
        (metaFor(locale, "").openGraph as { locale?: string }).locale as string
    );
    expect(new Set(seen).size).toBe(LOCALES.length);
  });

  it("translates title and description rather than reusing English", () => {
    const en = metaFor("en", "burn");
    const ja = metaFor("ja", "burn");
    expect(ja.title).not.toBe(en.title);
    expect(ja.description).not.toBe(en.description);
  });

  it("attributes the X card to the project account", () => {
    const tw = metaFor("en", "stake").twitter as {
      site?: string;
      creator?: string;
      card?: string;
    };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.site).toBe(TWITTER_HANDLE);
    expect(tw.creator).toBe(TWITTER_HANDLE);
    expect(TWITTER_HANDLE.startsWith("@")).toBe(true);
  });

  it("keeps every description short enough to survive truncation", () => {
    for (const locale of LOCALES) {
      for (const route of ROUTES) {
        const description = metaFor(locale, route).description ?? "";
        expect(description.length).toBeGreaterThan(0);
        expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      }
    }
  });

  it("mirrors title and description into both card formats", () => {
    const meta = metaFor("es", "rewards");
    expect(meta.openGraph?.title).toBe(meta.title);
    expect((meta.twitter as { title?: string }).title).toBe(meta.title);
    expect(meta.openGraph?.description).toBe(meta.description);
    expect((meta.twitter as { description?: string }).description).toBe(
      meta.description
    );
  });
});
