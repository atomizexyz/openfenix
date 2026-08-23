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
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect falls back to the shared `demo` project |
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
| `bun run scan:rpcs` | Re-scan RPC endpoints by latency |
| `bun run flush` | Wipe `node_modules` and reinstall |

Run `gen:llms` after changing chains, locales, or protocol constants — a test
fails if the committed files drift.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/pages.yml`. Pull requests run the same build without
deploying.
