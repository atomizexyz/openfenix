import type { Metadata, Viewport } from "next";
import { LOCALES, DEFAULT_LOCALE, LOCALE_NAMES } from "@/config/constants";
import { FENIX_CHAINS } from "@/config/chains";
import { SITE_URL, alternatesFor, pageUrl } from "@/config/site";
import { ROOT_URL, TWITTER_HANDLE } from "@/lib/metadata";

/**
 * The site is a static export on GitHub Pages, so `/` cannot be an HTTP 301 --
 * there is no server to issue one. It used to be a `<meta http-equiv=refresh>`
 * stub, which meant any client that does not run JavaScript (every AI crawler,
 * curl, most link unfurlers) saw ~40 characters of boilerplate and nothing else.
 *
 * So `/` now serves the real thing: a complete, indexable English summary of the
 * protocol in the raw HTML. Browsers still get sent to their language via the
 * script below, exactly as before -- the redirect is now a progressive
 * enhancement layered on top of real content rather than a substitute for it.
 */

const enabledChains = FENIX_CHAINS.filter((c) => c.enabled);

// Kept under 160 characters: Google truncates search snippets around there and
// social cards start dropping text around 125.
const DESCRIPTION =
  "Burn XEN to create FENIX, then stake FENIX for trustless yield at a fixed " +
  "1.618% annual inflation rate. Live on 12 EVM chains. No admin keys.";

const TITLE = "Fenix Protocol: Burn XEN, Stake FENIX, Earn Trustless Yield";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: pageUrl(DEFAULT_LOCALE),
    languages: alternatesFor(""),
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: ROOT_URL,
    siteName: "Fenix Protocol",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootPage() {
  // Unchanged behaviour: every browser is sent on to its preferred language,
  // English included. Because this runs in <head> with location.replace, the
  // body below never paints for a JS client -- there is no flash and the
  // journey is exactly what it was when this page was a redirect stub.
  //
  // Clients that do not run JS (AI crawlers, curl, link unfurlers) skip the
  // script entirely and read the document, which is why it is now a full
  // English summary rather than a one-line placeholder.
  const script = `(function () {
    var locales = ${JSON.stringify(LOCALES)};
    var fallback = ${JSON.stringify(DEFAULT_LOCALE)};
    var target = fallback;
    var preferred = navigator.languages || [navigator.language];
    for (var i = 0; i < preferred.length; i++) {
      var tag = String(preferred[i] || "").toLowerCase();
      var base = tag.split("-")[0];
      if (locales.indexOf(tag) !== -1) { target = tag; break; }
      if (locales.indexOf(base) !== -1) { target = base; break; }
    }
    location.replace("/" + target + "/" + location.search + location.hash);
  })();`;

  return (
    <html lang={DEFAULT_LOCALE}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <script dangerouslySetInnerHTML={{ __html: script }} />
      </head>
      <body>
        <main>
          <h1>Fenix Protocol</h1>
          <p>
            <strong>Burn XEN, stake FENIX, earn trustless yield.</strong> Fenix
            Protocol is a hyperstructure: an unowned, unstoppable, free-to-use
            set of smart contracts that runs forever without maintenance. There
            are no admin keys and no back doors.
          </p>

          <p>
            <a href={pageUrl(DEFAULT_LOCALE)}>
              Open the Fenix Protocol app (English)
            </a>
          </p>

          <h2>How Fenix Protocol works</h2>
          <dl>
            <dt>Proof of Burn</dt>
            <dd>
              FENIX is created exclusively from burned XEN tokens, at a fixed
              ratio of 10,000 XEN to 1 FENIX. There is no pre-mine and no
              investor allocation — the only way FENIX enters circulation is by
              someone destroying XEN to mint it.
            </dd>

            <dt>Equity Staking</dt>
            <dd>
              A dynamic equity pool where stakers deposit FENIX and receive
              proportional shares. Stake terms run from 1 to 7,777 days, and
              longer and larger stakes earn bonus shares.
            </dd>

            <dt>Trustless Yield</dt>
            <dd>
              A fixed 1.618% annual inflation rate is distributed to committed
              stakers in proportion to the shares they hold. Ending a stake
              early or more than 180 days late incurs a penalty.
            </dd>

            <dt>Rewards</dt>
            <dd>
              Adoption and equity reward pools are flushed on a recurring
              schedule, distributing accumulated rewards to stakers.
            </dd>
          </dl>

          <h2>Supported chains</h2>
          <p>
            Fenix Protocol is deployed on {enabledChains.length} EVM chains. The
            contract address for each deployment:
          </p>
          <ul>
            {enabledChains.map(({ chain, fenixContract }) => (
              <li key={chain.id}>
                {chain.name} (chain ID {chain.id}) — FENIX contract{" "}
                <code>{fenixContract}</code>
              </li>
            ))}
          </ul>

          <h2>Sections of the app</h2>
          <ul>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "dashboard")}>Dashboard</a> —
              protocol overview and real-time statistics across every chain.
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "burn")}>Burn</a> — transfer XEN
              value into the FENIX contract at the fixed 10,000:1 ratio.
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "stake")}>Stake</a> — lock FENIX
              to earn yield through equity-based distribution.
            </li>
            <li>
              <a href={pageUrl(DEFAULT_LOCALE, "rewards")}>Rewards</a> — view
              and claim staking rewards.
            </li>
          </ul>

          <h2>Resources for developers and agents</h2>
          <ul>
            <li>
              <a href={`${SITE_URL}/llms.txt`}>llms.txt</a> — structured index
              of this site for language models.
            </li>
            <li>
              <a href={`${SITE_URL}/sitemap.xml`}>sitemap.xml</a> — every page
              in every language.
            </li>
            <li>
              <a href={`${SITE_URL}/robots.txt`}>robots.txt</a> — crawl policy.
            </li>
            <li>
              <a href="https://github.com/atomizexyz/litepaper">Litepaper</a> —
              protocol design and mechanism specification.
            </li>
            <li>
              <a href="https://github.com/atomizexyz">
                Source code on GitHub (atomizexyz)
              </a>{" "}
              — contracts and this front end.
            </li>
            <li>
              <a href="https://skynet.certik.com/projects/fenix">
                CertiK security audit
              </a>{" "}
              — third-party review of the contracts.
            </li>
          </ul>

          <h2>Languages</h2>
          <p>Fenix Protocol is available in {LOCALES.length} languages.</p>
          <ul>
            {LOCALES.map((locale) => (
              <li key={locale}>
                <a href={pageUrl(locale)} hrefLang={locale}>
                  {LOCALE_NAMES[locale]}
                </a>
              </li>
            ))}
          </ul>
        </main>
      </body>
    </html>
  );
}
