import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LOCALES, DEFAULT_LOCALE } from "@/config/constants";
import { FENIX_CHAINS } from "@/config/chains";
import {
  SITE_URL,
  ROUTES,
  pageUrl,
  allPages,
  alternatesFor,
} from "@/config/site";
import { buildLlmsTxt, buildLlmsFullTxt } from "@/lib/llms-txt";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const projectRoot = resolve(__dirname, "..", "..");
const readPublic = (name: string) =>
  readFileSync(resolve(projectRoot, "public", name), "utf8");

describe("site URL helpers", () => {
  it("builds locale home URLs with a trailing slash", () => {
    // trailingSlash: true -- without the slash GitHub Pages issues a redirect.
    expect(pageUrl("en")).toBe(`${SITE_URL}/en/`);
    expect(pageUrl("ja")).toBe(`${SITE_URL}/ja/`);
  });

  it("builds section URLs with a trailing slash", () => {
    expect(pageUrl("en", "burn")).toBe(`${SITE_URL}/en/burn/`);
    expect(pageUrl("ar", "rewards")).toBe(`${SITE_URL}/ar/rewards/`);
  });

  it("never emits a double slash or a missing slash", () => {
    for (const { url } of allPages()) {
      expect(url.startsWith(`${SITE_URL}/`)).toBe(true);
      expect(url.endsWith("/")).toBe(true);
      expect(url.slice(SITE_URL.length)).not.toMatch(/\/\//);
    }
  });

  it("covers every locale and route exactly once", () => {
    const pages = allPages();
    expect(pages).toHaveLength(LOCALES.length * ROUTES.length);
    expect(new Set(pages.map((p) => p.url)).size).toBe(pages.length);
  });

  it("emits an hreflang entry per locale plus x-default", () => {
    const alts = alternatesFor("stake");
    for (const locale of LOCALES) {
      expect(alts[locale]).toBe(pageUrl(locale, "stake"));
    }
    expect(alts["x-default"]).toBe(pageUrl(DEFAULT_LOCALE, "stake"));
    expect(Object.keys(alts)).toHaveLength(LOCALES.length + 1);
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  it("lists every locale x route page", () => {
    expect(entries).toHaveLength(LOCALES.length * ROUTES.length);
    const urls = new Set(entries.map((e) => e.url));
    for (const { url } of allPages()) expect(urls.has(url)).toBe(true);
  });

  it("carries hreflang alternates on every entry", () => {
    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages)).toHaveLength(LOCALES.length + 1);
      expect(languages["x-default"]).toBeDefined();
    }
  });

  it("prioritises locale home pages above sections", () => {
    const home = entries.find((e) => e.url === pageUrl("en"));
    const burn = entries.find((e) => e.url === pageUrl("en", "burn"));
    expect(home?.priority).toBe(1);
    expect(burn?.priority).toBe(0.8);
  });

  it("uses absolute URLs so the static file is self-contained", () => {
    for (const entry of entries) {
      expect(entry.url.startsWith("https://")).toBe(true);
    }
  });
});

describe("robots.txt", () => {
  const result = robots();

  it("points crawlers at the sitemap", () => {
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("allows every crawler, AI agents included", () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const wildcard = rules.find((r) => r?.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard?.allow).toBe("/");
    // A stray Disallow would silently de-index the whole site.
    for (const rule of rules) expect(rule?.disallow).toBeUndefined();
  });
});

describe("llms.txt", () => {
  const committed = readPublic("llms.txt");

  it("matches the generator (run `bun run gen:llms` after config changes)", () => {
    expect(committed).toBe(buildLlmsTxt());
  });

  it("follows the llmstxt.org shape: one H1, then a blockquote summary", () => {
    const lines = committed.split("\n");
    expect(lines[0]).toBe("# Fenix Protocol");
    expect(committed.match(/^# /gm)).toHaveLength(1);
    expect(lines[2].startsWith("> ")).toBe(true);
  });

  it("names the product so name-based searches can surface it", () => {
    expect(committed).toContain("Fenix Protocol");
  });

  it("links the core pages and machine-readable resources", () => {
    for (const route of ROUTES) {
      expect(committed).toContain(pageUrl(DEFAULT_LOCALE, route));
    }
    expect(committed).toContain(`${SITE_URL}/sitemap.xml`);
    expect(committed).toContain(`${SITE_URL}/robots.txt`);
    expect(committed).toContain(`${SITE_URL}/llms-full.txt`);
  });

  it("lists every enabled chain and its contract", () => {
    for (const { chain, fenixContract } of FENIX_CHAINS.filter(
      (c) => c.enabled
    )) {
      expect(committed).toContain(`${chain.name} (chain ID ${chain.id})`);
      expect(committed).toContain(fenixContract);
    }
  });

  it("lists every locale home page", () => {
    for (const locale of LOCALES) {
      expect(committed).toContain(pageUrl(locale));
    }
  });

  it("uses markdown link-list syntax under its sections", () => {
    expect(committed).toMatch(/^- \[Home\]\(https:\/\/fenix\.fyi\/en\/\): /m);
  });
});

describe("llms-full.txt", () => {
  const committed = readPublic("llms-full.txt");

  it("matches the generator", () => {
    expect(committed).toBe(buildLlmsFullTxt());
  });

  it("starts with a single H1 and a blockquote summary", () => {
    const lines = committed.split("\n");
    expect(lines[0]).toBe("# Fenix Protocol -- Full Reference");
    expect(committed.match(/^# /gm)).toHaveLength(1);
    expect(lines[2].startsWith("> ")).toBe(true);
  });

  it("documents both contract addresses for every enabled chain", () => {
    for (const { chain, fenixContract, xenContract } of FENIX_CHAINS.filter(
      (c) => c.enabled
    )) {
      expect(committed).toContain(`| ${chain.name} | ${chain.id} |`);
      expect(committed).toContain(fenixContract);
      expect(committed).toContain(xenContract);
    }
  });

  it("states that there is no API, so agents stop looking for one", () => {
    expect(committed).toMatch(/no REST or GraphQL API/i);
  });
});
