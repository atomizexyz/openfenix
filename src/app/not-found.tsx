import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "@/config/constants";
import { SITE_URL, pageUrl } from "@/config/site";

/**
 * Exported to out/404.html, which GitHub Pages serves with a real HTTP 404 for
 * any unknown path. The body is deliberately a recovery aid rather than a dead
 * end: an agent that lands here gets, in the raw HTML, the handful of URLs it
 * needs to re-orient (sitemap, llms.txt, the locale home pages).
 *
 * The markdown block is the same information in a form that survives HTML being
 * stripped. GitHub Pages sends this as text/html and gives us no way to change
 * that, so embedding the markdown is the closest we can get to a markdown body.
 */

const MARKDOWN_BODY = `# 404 — Page Not Found

The requested path does not exist on ${SITE_URL}.

## Where to look next

- [Site map](${SITE_URL}/sitemap.xml) — every page in every language
- [llms.txt](${SITE_URL}/llms.txt) — structured index of this site
- [Home](${SITE_URL}/) — protocol overview
- [Dashboard](${pageUrl(DEFAULT_LOCALE, "dashboard")}) — live protocol statistics
- [Burn](${pageUrl(DEFAULT_LOCALE, "burn")}) — burn XEN for FENIX
- [Stake](${pageUrl(DEFAULT_LOCALE, "stake")}) — stake FENIX for yield
- [Rewards](${pageUrl(DEFAULT_LOCALE, "rewards")}) — view and claim rewards

## URL shape

Pages are namespaced by language: \`/{locale}/{section}/\` with a trailing
slash, for example \`/en/dashboard/\` or \`/ja/stake/\`.
`;

export const metadata: Metadata = {
  title: "404: Page Not Found | Fenix Protocol",
  description:
    "The requested path does not exist. See the sitemap or llms.txt for a full index of Fenix Protocol pages.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <main>
          <h1>404: Page Not Found</h1>
          <p>The requested path does not exist on {SITE_URL}.</p>

          <h2>Where to look next</h2>
          <ul>
            <li>
              <a href={`${SITE_URL}/sitemap.xml`}>Site map</a> — every page in
              every language
            </li>
            <li>
              <a href={`${SITE_URL}/llms.txt`}>llms.txt</a> — structured index
              of this site
            </li>
            <li>
              <a href={`${SITE_URL}/`}>Home</a> — protocol overview
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "dashboard")}>Dashboard</a> —
              live protocol statistics
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "burn")}>Burn</a> — burn XEN for
              FENIX
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "stake")}>Stake</a> — stake
              FENIX for yield
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "rewards")}>Rewards</a> — view
              and claim rewards
            </li>
          </ul>

          <h2>URL shape</h2>
          <p>
            Pages are namespaced by language: <code>/{"{locale}"}/{"{section}"}/</code>{" "}
            with a trailing slash, for example <code>/en/dashboard/</code> or{" "}
            <code>/ja/stake/</code>.
          </p>

          {/* Same content as markdown, for clients that strip HTML. */}
          <pre data-format="markdown">{MARKDOWN_BODY}</pre>
        </main>
      </body>
    </html>
  );
}
