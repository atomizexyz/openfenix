# fenix.fyi

Front end for [Fenix Protocol](https://fenix.fyi) — burn XEN, stake FENIX, earn
trustless yield. Next.js App Router, static export, 21 languages, 12 EVM chains.

## Start

Requires [Bun](https://bun.sh) 1.4.0 (pinned in `package.json`).

```bash
bun install
bun run dev
```

Open <http://localhost:7777>.

That's it — no environment variables are needed to run locally.

## Environment (optional)

Both variables have working fallbacks, so skip this unless you need the real
thing.

```bash
cp .env.local.example .env.local
```

| Variable | Without it |
| --- | --- |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Reown AppKit falls back to a placeholder id that Reown rejects, so WalletConnect (QR / mobile) will not work. Create one at [dashboard.reown.com](https://dashboard.reown.com) and allowlist your domains there |
| `NEXT_PUBLIC_BLINK_API_KEY` | Writes use the public RPCs, with no MEV protection |

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server on port 7777 |
| `bun run build` | Static export to `out/` |
| `bun run preview` | Serve the built `out/` on port 7777 |
| `bun run lint` | ESLint |
| `bun run test` | Vitest, watch mode |
| `bun run test:run` | Vitest, single run |
| `bun run gen:llms` | Regenerate `public/llms.txt` and `llms-full.txt` |
| `bun run scan:rpcs` | Re-scan every curated and Chainlist RPC for health, browser CORS, and latency |
| `bun run bench:rpcs` | Compare each chain's smart transport with every configured direct RPC |
| `bun run bench:rpcs:summary` | Summarize completed live runs and flag missing chain coverage |
| `bun run verify:reads` | Check the app's Multicall3 reads through every chain's smart transport |
| `bun run flush` | Wipe `node_modules` and reinstall |

Run `gen:llms` after changing chains, locales, or protocol constants — a test
fails if the committed files drift.

## RPC performance

Every chain has an independent policy in `src/config/rpc-policies.ts` and its
own learned routing state. Tune its racing, hedging, batching, timeout, and retry
settings independently; endpoint discovery remains in `scan:rpcs`.

Multiple-provider chains race their two best-scored connections and hedge a
stalled read to another provider after 250 ms or twice the learned tail latency,
whichever is longer. Avalanche, Base, EthereumPoW, Fantom, Moonbeam, and OKC
disable HTTP batching to remove measured scheduling and provider batch overhead.
The other chains' endpoint scans already disable it. The app's separate
Multicall3 batching still groups contract reads.

A tracked Bun patch fixes `smart-hyperevm@0.1.0` retaining a lag penalty after
an endpoint's block-height observation expires. Otherwise a previously fast
provider can remain excluded indefinitely when background probes are disabled.
`bun install` applies the patch; `rpc-head-freshness.test.ts` tests the compiled
dependency and ensures genuinely fresh lag observations still affect routing.

Run the live, read-only comparison with:

```bash
bun run bench:rpcs --variant=both --samples=100 --warmup=5 --concurrency=4 --output=artifacts/rpc-performance/all.json
```

Use `--chains=1,137` to restrict a run. `--variant=both` interleaves the original
transport defaults and current per-chain policies against the same direct RPC
samples. The workloads are block-number reads and FENIX `totalSupply` calls.
The benchmark makes no transaction submissions.
Use `--interval-ms=2000` to pace rounds on providers with strict rate limits;
this applies to warm-up traffic as well as measured samples.

The targets are smart P50 at or below the fastest healthy direct P50, and smart
P99 at or below the worst healthy direct P99. Cold requests, unavailable
endpoints, errors, and incomplete coverage are reported separately. These are
observed targets, not guarantees about future network conditions. A 100-sample
P99 is a preliminary tail estimate; increase `--samples` for stronger evidence.
The CLI measures transport latency from the local runtime, excluding browser
CORS preflights and the application's separate Multicall3 scheduling delay.
Raw runs and the latest aggregate are in `artifacts/rpc-performance/`. The
summary rejects measurements from outdated policies, endpoint configurations,
or router code, and reports failure until every current production gate passes.
See the [recorded validation report](artifacts/rpc-performance/report.txt) for
the measured results and remaining latency failures.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/pages.yml`. Pull requests run the same build without
deploying.
