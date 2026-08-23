import { LOCALES, DEFAULT_LOCALE, LOCALE_NAMES } from "@/config/constants";
import { FENIX_CHAINS } from "@/config/chains";
import {
  INFLATION_RATE,
  MAX_STAKE_DAYS,
  MIN_STAKE_DAYS,
  XEN_TO_FENIX_RATIO,
  SOCIAL_LINKS,
} from "@/config/constants";
import { SITE_URL, pageUrl } from "@/config/site";

/**
 * Generators for /llms.txt and /llms-full.txt, following the llmstxt.org
 * format: a single H1, a blockquote summary, then H2 sections whose bodies are
 * markdown link lists of the form `- [name](url): description`.
 *
 * These are generated rather than hand-written so the chain list, locale list
 * and protocol constants can never drift from src/config. The committed files
 * in public/ are checked against these functions by llms-txt.test.ts, and
 * regenerated with `bun run gen:llms`.
 */

const SUMMARY =
  "Fenix Protocol is a hyperstructure that turns burned XEN into FENIX: " +
  "burn XEN at a fixed 10,000:1 ratio, then stake FENIX for equity-based " +
  "yield at a fixed 1.618% annual inflation rate. No admin keys, no pre-mine, " +
  "no investor allocation.";

function enabledChains() {
  return FENIX_CHAINS.filter((c) => c.enabled);
}

/** The concise index. */
export function buildLlmsTxt(): string {
  const chains = enabledChains();

  const lines: string[] = [
    "# Fenix Protocol",
    "",
    `> ${SUMMARY}`,
    "",
    "Fenix Protocol is a set of immutable smart contracts deployed across " +
      `${chains.length} EVM chains. This site is the reference front end: a ` +
      "fully static, server-rendered application with no account system and no " +
      `API keys. Every page is available in ${LOCALES.length} languages under ` +
      "a `/{locale}/` prefix with a trailing slash.",
    "",
    "## Core pages",
    "",
    `- [Home](${pageUrl(DEFAULT_LOCALE)}): protocol overview, live cross-chain statistics, and liquidity pairs.`,
    `- [Dashboard](${pageUrl(DEFAULT_LOCALE, "dashboard")}): real-time protocol statistics including total burned, total staked, share rate, and equity and reward pool sizes.`,
    `- [Burn](${pageUrl(DEFAULT_LOCALE, "burn")}): burn XEN to mint FENIX at a fixed ratio of ${XEN_TO_FENIX_RATIO.toLocaleString("en-US")} XEN to 1 FENIX.`,
    `- [Stake](${pageUrl(DEFAULT_LOCALE, "stake")}): lock FENIX for a term of ${MIN_STAKE_DAYS} to ${MAX_STAKE_DAYS.toLocaleString("en-US")} days to earn equity-based yield, with bonus shares for longer and larger stakes.`,
    `- [Rewards](${pageUrl(DEFAULT_LOCALE, "rewards")}): view accumulated adoption and equity pool rewards and flush them to stakers.`,
    "",
    "## Protocol mechanics",
    "",
    `- [Litepaper](${SOCIAL_LINKS.litepaper}): full protocol design and mechanism specification.`,
    `- [Source code](${SOCIAL_LINKS.github}): Solidity contracts and this front end.`,
    `- [Security audit](${SOCIAL_LINKS.certik}): third-party CertiK review of the contracts.`,
    "",
    "## Machine-readable resources",
    "",
    `- [llms-full.txt](${SITE_URL}/llms-full.txt): expanded version of this file with protocol constants and per-chain contract addresses inline.`,
    `- [sitemap.xml](${SITE_URL}/sitemap.xml): every page in every language, with hreflang alternates.`,
    `- [robots.txt](${SITE_URL}/robots.txt): crawl policy. All crawlers are allowed.`,
    "",
    "## Deployments",
    "",
    ...chains.map(
      ({ chain, fenixContract }) =>
        `- ${chain.name} (chain ID ${chain.id}): FENIX at \`${fenixContract}\``
    ),
    "",
    "## Languages",
    "",
    ...LOCALES.map(
      (locale) =>
        `- [${LOCALE_NAMES[locale]}](${pageUrl(locale)}): ${locale}`
    ),
    "",
    "## Notes",
    "",
    "- There is no REST or GraphQL API. All protocol state is read directly " +
      "from the contracts over JSON-RPC; the addresses above are the entry points.",
    "- The site is a static export with no authentication, no cookies required, " +
      "and no rate limiting.",
    "",
  ];

  return lines.join("\n");
}

/** The expanded variant: same index plus the numbers an agent would ask for. */
export function buildLlmsFullTxt(): string {
  const chains = enabledChains();

  const lines: string[] = [
    "# Fenix Protocol -- Full Reference",
    "",
    `> ${SUMMARY}`,
    "",
    "## What Fenix Protocol is",
    "",
    "Fenix Protocol is a hyperstructure: an unowned, unstoppable, free-to-use " +
      "set of smart contracts that runs forever without maintenance. There are " +
      "no admin keys and no back doors. FENIX can only be created by burning " +
      "XEN, so there is no pre-mine and no investor allocation.",
    "",
    "## Mechanics",
    "",
    "### Proof of Burn",
    "",
    `FENIX is minted exclusively by burning XEN, at a fixed ratio of ` +
      `${XEN_TO_FENIX_RATIO.toLocaleString("en-US")} XEN to 1 FENIX. Burning is ` +
      "irreversible and is the only path for FENIX to enter circulation.",
    "",
    "### Equity Staking",
    "",
    "Stakers deposit FENIX into a dynamic equity pool and receive proportional " +
      "shares. Stake terms run from " +
      `${MIN_STAKE_DAYS} to ${MAX_STAKE_DAYS.toLocaleString("en-US")} days. ` +
      "Longer terms earn a time bonus and larger deposits earn a size bonus, " +
      "both of which increase the shares credited to the stake.",
    "",
    "### Trustless Yield",
    "",
    `A fixed ${INFLATION_RATE.toFixed(6)}% annual inflation rate is distributed ` +
      "to stakers in proportion to shares held. Ending a stake before its term " +
      "or more than 180 days after maturity incurs a penalty.",
    "",
    "### Rewards",
    "",
    "Adoption and equity reward pools accumulate and are flushed on a recurring " +
      "schedule, distributing their balance to stakers.",
    "",
    "## Protocol constants",
    "",
    `- XEN to FENIX burn ratio: ${XEN_TO_FENIX_RATIO.toLocaleString("en-US")}:1`,
    `- Annual inflation rate: ${INFLATION_RATE.toFixed(6)}%`,
    `- Minimum stake term: ${MIN_STAKE_DAYS} day`,
    `- Maximum stake term: ${MAX_STAKE_DAYS.toLocaleString("en-US")} days`,
    `- Supported chains: ${chains.length}`,
    `- Supported languages: ${LOCALES.length}`,
    "",
    "## Contract addresses",
    "",
    "| Chain | Chain ID | FENIX contract | XEN contract |",
    "| --- | --- | --- | --- |",
    ...chains.map(
      ({ chain, fenixContract, xenContract }) =>
        `| ${chain.name} | ${chain.id} | \`${fenixContract}\` | \`${xenContract}\` |`
    ),
    "",
    "## Reading protocol state",
    "",
    "There is no REST or GraphQL API and no API keys. Protocol state is read " +
      "directly from the contracts over JSON-RPC using standard `eth_call` " +
      "requests against the addresses above.",
    "",
    "## Pages",
    "",
    ...LOCALES.flatMap((locale) => [
      `- ${LOCALE_NAMES[locale]} (\`${locale}\`): ` +
        [
          `[home](${pageUrl(locale)})`,
          `[dashboard](${pageUrl(locale, "dashboard")})`,
          `[burn](${pageUrl(locale, "burn")})`,
          `[stake](${pageUrl(locale, "stake")})`,
          `[rewards](${pageUrl(locale, "rewards")})`,
        ].join(", "),
    ]),
    "",
    "## Links",
    "",
    `- [Litepaper](${SOCIAL_LINKS.litepaper})`,
    `- [Source code](${SOCIAL_LINKS.github})`,
    `- [Security audit](${SOCIAL_LINKS.certik})`,
    `- [X / Twitter](${SOCIAL_LINKS.twitter})`,
    `- [Telegram](${SOCIAL_LINKS.telegram})`,
    "",
  ];

  return lines.join("\n");
}
