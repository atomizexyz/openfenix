/**
 * Benchmarks every public RPC chainlist.org knows about for the chains FENIX is
 * deployed on, then writes the winners to src/config/rpc-endpoints.generated.ts.
 *
 *   bun run scan:rpcs
 *
 * An endpoint has to earn its place: it must report the right chain id, keep up
 * with its peers' block height, answer CORS preflight (the app is browser-only,
 * so an endpoint that curl likes but a browser refuses is useless), and survive
 * repeated calls. Survivors are ranked by median latency.
 */

import { writeFileSync } from "node:fs";
import { FENIX_CHAINS } from "../src/config/chains";

const CHAINLIST_URL = "https://chainlist.org/rpcs.json";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_GET_BLOCK_NUMBER = "0x42cbb15c";

/** Endpoints kept per chain. Enough for real failover without a long tail. */
const KEEP_PER_CHAIN = 5;
/** Latency samples per endpoint; median is what counts. */
const SAMPLES = 3;
const TIMEOUT_MS = 5_000;
const CONCURRENCY = 24;
/** How far behind the leading block an endpoint may fall before we drop it. */
const MAX_BLOCKS_BEHIND = 30;
/** Origin sent on probes so CORS behaviour matches the deployed site. */
const ORIGIN = "https://fenix.fyi";

interface ChainlistRpc {
  url: string;
  tracking?: string;
}
interface ChainlistChain {
  chainId: number;
  name: string;
  rpc?: (ChainlistRpc | string)[];
}

interface Probe {
  url: string;
  tracking: string;
  ok: boolean;
  reason?: string;
  medianMs: number;
  blockNumber: number;
  cors: boolean;
  multicall: boolean;
  batch: boolean;
}

interface RpcCallResult {
  ok: boolean;
  ms: number;
  result?: unknown;
  cors: boolean;
  error?: string;
}

async function rpcCall(
  url: string,
  method: string,
  params: unknown[] = [],
): Promise<RpcCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    const ms = performance.now() - started;
    const allowOrigin = res.headers.get("access-control-allow-origin");
    const cors = allowOrigin === "*" || allowOrigin === ORIGIN;
    if (!res.ok) return { ok: false, ms, cors, error: `http ${res.status}` };
    const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (json.error) return { ok: false, ms, cors, error: json.error.message ?? "rpc error" };
    return { ok: true, ms, cors, result: json.result };
  } catch (error) {
    return {
      ok: false,
      ms: performance.now() - started,
      cors: false,
      error: error instanceof Error ? error.name : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Does the endpoint honour JSON-RPC batching? Halves round-trips when it does. */
async function supportsBatch(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      ]),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const json = await res.json();
    return Array.isArray(json) && json.length === 2;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function probe(url: string, tracking: string, chainId: number): Promise<Probe> {
  const fail = (reason: string, cors = false): Probe => ({
    url,
    tracking,
    ok: false,
    reason,
    medianMs: Number.POSITIVE_INFINITY,
    blockNumber: 0,
    cors,
    multicall: false,
    batch: false,
  });

  const id = await rpcCall(url, "eth_chainId");
  if (!id.ok) return fail(id.error ?? "unreachable");
  if (Number(id.result) !== chainId) {
    return fail(`wrong chain (got ${Number(id.result)})`, id.cors);
  }
  if (!id.cors) return fail("no CORS", false);

  const latencies: number[] = [];
  let blockNumber = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const call = await rpcCall(url, "eth_blockNumber");
    if (!call.ok) return fail(call.error ?? "flaky", true);
    latencies.push(call.ms);
    blockNumber = Math.max(blockNumber, Number(call.result));
  }

  const [multicallCall, batch] = await Promise.all([
    rpcCall(url, "eth_call", [
      { to: MULTICALL3, data: MULTICALL3_GET_BLOCK_NUMBER },
      "latest",
    ]),
    supportsBatch(url),
  ]);

  return {
    url,
    tracking,
    ok: true,
    medianMs: median(latencies),
    blockNumber,
    cors: true,
    multicall: multicallCall.ok,
    batch,
  };
}

/** Runs tasks with a bounded worker pool so a big chain doesn't open 80 sockets. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Privacy posture reported by chainlist; used only to break latency ties. */
function trackingRank(tracking: string): number {
  if (tracking === "none") return 0;
  if (tracking === "limited") return 1;
  if (tracking === "yes") return 3;
  return 2;
}

async function main() {
  console.log(`Fetching ${CHAINLIST_URL} ...`);
  const chainlist = (await (await fetch(CHAINLIST_URL)).json()) as ChainlistChain[];

  const chains = FENIX_CHAINS.filter((c) => c.enabled);
  const selected: Record<number, Probe[]> = {};

  for (const { chain } of chains) {
    const entry = chainlist.find((c) => c.chainId === chain.id);

    // chainlist normalises most entries to objects, but a few are bare strings.
    const listed = (entry?.rpc ?? []).map((rpc) =>
      typeof rpc === "string" ? { url: rpc, tracking: "unknown" } : rpc,
    );

    // Fall back to whatever viem ships if chainlist has never heard of the chain.
    const fromViem = chain.rpcUrls.default.http.map((url) => ({ url, tracking: "unknown" }));

    const candidates = [...listed, ...fromViem]
      .filter((rpc) => rpc.url?.startsWith("https://"))
      // "${INFURA_API_KEY}" style entries need credentials we don't have.
      .filter((rpc) => !rpc.url.includes("${"))
      .filter((rpc, i, all) => all.findIndex((o) => o.url === rpc.url) === i);

    process.stdout.write(
      `${chain.name} (${chain.id}): probing ${candidates.length} endpoints ... `,
    );

    const probes = await pooled(candidates, CONCURRENCY, (rpc) =>
      probe(rpc.url, rpc.tracking ?? "unknown", chain.id),
    );

    const healthy = probes.filter((p) => p.ok);
    // Trust the leading height rather than the median: a majority of stale
    // mirrors shouldn't be able to vote a current node out.
    const leadingBlock = Math.max(0, ...healthy.map((p) => p.blockNumber));
    const current = healthy.filter((p) => p.blockNumber >= leadingBlock - MAX_BLOCKS_BEHIND);

    current.sort(
      (a, b) =>
        a.medianMs - b.medianMs ||
        trackingRank(a.tracking) - trackingRank(b.tracking),
    );

    selected[chain.id] = current.slice(0, KEEP_PER_CHAIN);
    console.log(
      `${healthy.length} healthy, ${current.length} current, keeping ${selected[chain.id].length}`,
    );
    for (const p of selected[chain.id]) {
      console.log(
        `    ${String(Math.round(p.medianMs)).padStart(5)}ms  ${p.url}` +
          `${p.multicall ? "" : "  [no multicall3]"}${p.batch ? "" : "  [no batch]"}`,
      );
    }
    if (selected[chain.id].length === 0) {
      console.warn(`    !! no usable endpoint found for ${chain.name}`);
    }
  }

  writeFileSync(
    new URL("../src/config/rpc-endpoints.generated.ts", import.meta.url),
    render(chains.map((c) => c.chain), selected),
  );
  console.log("\nWrote src/config/rpc-endpoints.generated.ts");
}

function render(
  chains: { id: number; name: string }[],
  selected: Record<number, Probe[]>,
): string {
  const body = chains
    .map(({ id, name }) => {
      const probes = selected[id] ?? [];
      const urls = probes
        .map(
          (p) =>
            `      // ${String(Math.round(p.medianMs)).padStart(4)}ms` +
            `${p.multicall ? "" : ", no multicall3"}${p.batch ? "" : ", no batch"}` +
            `\n      "${p.url}",`,
        )
        .join("\n");
      return `  // ${name}\n  ${id}: {\n    http: [\n${urls}\n    ],\n    multicall: ${
        probes.every((p) => p.multicall) && probes.length > 0
      },\n    batch: ${probes.every((p) => p.batch) && probes.length > 0},\n  },`;
    })
    .join("\n");

  return `// GENERATED by scripts/scan-rpcs.ts -- do not edit by hand.
// Re-run with: bun run scan:rpcs
//
// Endpoints are ordered fastest-first by median latency, measured from a single
// machine at generation time. Every one reported the correct chain id, was
// within ${MAX_BLOCKS_BEHIND} blocks of the chain head, and returned permissive CORS headers.

export interface GeneratedRpcConfig {
  http: string[];
  /** Every listed endpoint answered a Multicall3 call. */
  multicall: boolean;
  /** Every listed endpoint honoured JSON-RPC batching. */
  batch: boolean;
}

export const GENERATED_RPC_ENDPOINTS: Record<number, GeneratedRpcConfig> = {
${body}
};
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
