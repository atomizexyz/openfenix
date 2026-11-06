/**
 * Read-only RPC latency experiment. No transactions are signed or broadcast.
 *
 * bun run scripts/benchmark-rpcs.ts --chains=1,137 --samples=100 --warmup=5 \
 *   --concurrency=2 --variant=both --output=artifacts/rpc-performance/run.json
 *
 * Each round shuffles every endpoint and each smart variant, with at most one
 * user request in flight per transport. Successful responses are fully parsed
 * and validated before stopping the clock. The smart transport's own racing
 * may create additional upstream requests, which telemetry records separately.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { http, type Transport } from "viem";
import { smartHyperevm, type HyperevmTransportValue } from "@bloxwap/smart-hyperevm/transport";
import { FENIX_CHAINS, type FenixChainConfig } from "../src/config/chains";
import { GENERATED_RPC_ENDPOINTS } from "../src/config/rpc-endpoints.generated";
import { createChainTransport, WRITE_METHODS } from "../src/config/rpc";
import { RPC_POLICIES } from "../src/config/rpc-policies";
import { compareLatency, summarize, type LatencySample } from "./rpc-benchmark/statistics";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ORIGIN = "https://fenix.fyi";
const DIRECT_TIMEOUT_MS = 10_000;
const PREFLIGHT_TIMEOUT_MS = 5_000;
const MIN_SAMPLES = 100;
const METHODS = ["eth_blockNumber", "eth_call"] as const;
type Method = typeof METHODS[number];
type Variant = "baseline" | "production";
type Instance = ReturnType<Transport>;

function argument(name: string, fallback: string): string {
  const entry = process.argv.slice(2).find((item) => item.startsWith(`--${name}=`));
  return entry ? entry.slice(name.length + 3) : fallback;
}

function integerArgument(name: string, fallback: number, min: number, max: number): number {
  const result = Number(argument(name, String(fallback)));
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new Error(`--${name} must be an integer from ${min} to ${max}`);
  }
  return result;
}

function options() {
  const known = new Set(["chains", "samples", "warmup", "concurrency", "output", "variant", "seed", "interval-ms"]);
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--") || !arg.includes("=") || !known.has(arg.slice(2).split("=")[0])) {
      throw new Error(`Unknown argument ${arg}; use --name=value syntax`);
    }
  }
  const chainIds = argument("chains", FENIX_CHAINS.map(({ chain }) => chain.id).join(",")).split(",").map(Number);
  if (chainIds.some((id) => !FENIX_CHAINS.some(({ chain }) => chain.id === id))) {
    throw new Error("--chains contains an unknown chain ID");
  }
  const variant = argument("variant", "production");
  if (!["baseline", "production", "both"].includes(variant)) throw new Error("Invalid --variant");
  return {
    chainIds: [...new Set(chainIds)],
    samples: integerArgument("samples", 100, 1, 10_000),
    warmup: integerArgument("warmup", 5, 0, 100),
    concurrency: integerArgument("concurrency", 2, 1, 4),
    intervalMs: integerArgument("interval-ms", 0, 0, 60_000),
    seed: integerArgument("seed", 20_261_105, 1, 2_147_483_647),
    variants: (variant === "both" ? ["baseline", "production"] : [variant]) as Variant[],
    acceptanceVariant: variant === "baseline" ? "baseline" : "production",
    output: resolve(argument("output", "artifacts/rpc-performance/results.json")),
  };
}

function errorText(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  // Error bodies may contain provider URLs. No credential-bearing URL is saved.
  return value.replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
    try { return new URL(url).origin; } catch { return "[URL]"; }
  }).slice(0, 1_000);
}

function readUrls(config: FenixChainConfig): string[] {
  const generated = GENERATED_RPC_ENDPOINTS[config.chain.id]?.http ?? [];
  return [...new Set(generated.length ? generated : config.chain.rpcUrls.default.http)];
}

/** Frozen original read configuration, independent of later production tuning. */
function baselineTransport(config: FenixChainConfig): Transport {
  return smartHyperevm({
    endpoints: readUrls(config),
    batch: GENERATED_RPC_ENDPOINTS[config.chain.id]?.batch ? { wait: 16 } : false,
    cache: false,
    pinLatest: false,
    headLag: { probeInterval: false },
    nonIdempotentMethods: WRITE_METHODS,
    rebroadcastRawTransactions: true,
  });
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

async function parallel<T>(items: readonly T[], concurrency: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await run(item);
    }
  }));
}

function corsOrigin(response: Response): boolean {
  const origin = response.headers.get("access-control-allow-origin");
  return origin === "*" || origin === ORIGIN;
}

async function preflightOnce(url: string, chainId: number) {
  const start = performance.now();
  const outcome = {
    url, chainIdValid: false, chainId: null as string | null,
    corsPreflight: false, corsPost: false, latencyMs: 0,
    error: null as string | null,
  };
  try {
    const response = await fetch(url, {
      method: "POST", signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    outcome.corsPost = corsOrigin(response);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "JSON-RPC error");
    if (typeof body.result !== "string" || !/^0x[0-9a-f]+$/i.test(body.result)) throw new Error("Invalid chain ID result");
    outcome.chainId = body.result;
    outcome.chainIdValid = BigInt(body.result) === BigInt(chainId);
    if (!outcome.chainIdValid) throw new Error(`Wrong chain: expected ${chainId}, got ${body.result}`);
  } catch (error) {
    outcome.error = errorText(error);
  }
  outcome.latencyMs = performance.now() - start;
  if (outcome.chainIdValid) {
    try {
      const response = await fetch(url, {
        method: "OPTIONS", signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
        headers: {
          origin: ORIGIN, "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      const methods = response.headers.get("access-control-allow-methods")?.toUpperCase().split(/[\s,]+/) ?? [];
      const headers = response.headers.get("access-control-allow-headers")?.toLowerCase().split(/[\s,]+/) ?? [];
      outcome.corsPreflight = response.ok && corsOrigin(response) &&
        (methods.includes("*") || methods.includes("POST")) &&
        (headers.includes("*") || headers.includes("content-type"));
      await response.body?.cancel();
    } catch { /* CORS availability is reported separately from Node latency. */ }
  }
  return outcome;
}

/** A transient DNS/TLS/HTTP failure must not silently remove the fastest RPC. */
async function preflight(url: string, chainId: number) {
  const started = performance.now();
  const attempts: (Awaited<ReturnType<typeof preflightOnce>> & { attempt: number })[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    const outcome = await preflightOnce(url, chainId);
    attempts.push({ ...outcome, attempt: attempt + 1 });
    // A returned wrong chain is a definitive rejection, not a transient outage.
    if (outcome.chainIdValid || outcome.chainId !== null) break;
  }
  return { ...attempts[attempts.length - 1], attempts, totalElapsedMs: performance.now() - started };
}

interface Runner {
  id: string;
  kind: "direct" | Variant;
  url?: string;
  instance: Instance;
  /** viem's batch scheduler is global and keyed by URL plus caller signal. */
  signal: AbortSignal;
  cold: Partial<Record<Method, LatencySample>>;
  warmup: Record<Method, LatencySample[]>;
  samples: Record<Method, LatencySample[]>;
  stopped: Partial<Record<Method, string>>;
  telemetry: {
    upstreamRequests: number;
    upstreamByMethod: Record<string, number>;
    upstreamByOrigin: Record<string, number>;
    corsRejectedResponses: number;
    events: Record<string, number>;
  };
}

const requestContext = new AsyncLocalStorage<Runner>();
const originalFetch = globalThis.fetch;
// Send the site's origin in both cohorts. Bun does not itself enforce CORS;
// preflight and response CORS are reported, never presented as a browser test.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const runner = requestContext.getStore();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("origin", ORIGIN);
  if (runner) {
    runner.telemetry.upstreamRequests++;
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    runner.telemetry.upstreamByOrigin[url.origin] = (runner.telemetry.upstreamByOrigin[url.origin] ?? 0) + 1;
    try {
      const body = JSON.parse(String(init?.body)) as { method?: string } | { method?: string }[];
      for (const item of Array.isArray(body) ? body : [body]) {
        if (item.method) runner.telemetry.upstreamByMethod[item.method] = (runner.telemetry.upstreamByMethod[item.method] ?? 0) + 1;
      }
    } catch { /* Count HTTP calls even when a custom transport uses another body. */ }
  }
  const response = await originalFetch(input, { ...init, headers });
  if (runner && !corsOrigin(response)) runner.telemetry.corsRejectedResponses++;
  return response;
}) as typeof fetch;

function makeRunner(id: string, kind: Runner["kind"], transport: Transport, config: FenixChainConfig, url?: string): Runner {
  const instance = transport({ chain: config.chain });
  const runner: Runner = {
    id, kind, url, instance, signal: new AbortController().signal, cold: {},
    warmup: { eth_blockNumber: [], eth_call: [] },
    samples: { eth_blockNumber: [], eth_call: [] }, stopped: {},
    telemetry: { upstreamRequests: 0, upstreamByMethod: {}, upstreamByOrigin: {}, corsRejectedResponses: 0, events: {} },
  };
  const value = instance.value as Partial<HyperevmTransportValue> | undefined;
  value?.onEvent?.((event) => {
    runner.telemetry.events[event.type] = (runner.telemetry.events[event.type] ?? 0) + 1;
  });
  return runner;
}

async function measure(runner: Runner, config: FenixChainConfig, method: Method, iteration: number): Promise<LatencySample> {
  return requestContext.run(runner, async () => {
    const startedAt = new Date().toISOString();
    const start = performance.now();
    try {
      const result = method === "eth_blockNumber"
        ? await runner.instance.request({ method }, { signal: runner.signal })
        : await runner.instance.request({ method, params: [{ to: config.fenixContract, data: "0x18160ddd" }, "latest"] }, { signal: runner.signal });
      if (typeof result !== "string" || (method === "eth_blockNumber"
        ? !/^0x[0-9a-f]+$/i.test(result) || BigInt(result) <= 0n
        : !/^0x[0-9a-f]{64}$/i.test(result))) {
        throw new Error(`Invalid ${method} result: ${String(result).slice(0, 100)}`);
      }
      return { iteration, startedAt, latencyMs: performance.now() - start, success: true, result };
    } catch (error) {
      return { iteration, startedAt, latencyMs: performance.now() - start, success: false, error: errorText(error) };
    }
  });
}

function serializeRunner(runner: Runner) {
  const value = runner.instance.value as Partial<HyperevmTransportValue> | undefined;
  return {
    id: runner.id, kind: runner.kind, url: runner.url, cold: runner.cold,
    warmup: runner.warmup, samples: runner.samples, stopped: runner.stopped,
    summary: Object.fromEntries(METHODS.map((method) => [method, summarize(runner.samples[method])])),
    telemetry: runner.telemetry, snapshot: value?.snapshot?.(), cacheStats: value?.cacheStats?.(),
  };
}

function fingerprint(path: string): string | null {
  try { return createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest("hex"); }
  catch { return null; }
}

function gitHead(): string | null {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); }
  catch { return null; }
}

async function runChain(config: FenixChainConfig, opts: ReturnType<typeof options>, checkpoint: (chain: unknown) => void) {
  const startedAt = new Date().toISOString();
  const urls = readUrls(config);
  const probes: Awaited<ReturnType<typeof preflight>>[] = [];
  console.log(`[${config.chain.id}] ${config.chain.name}: preflight ${urls.length} endpoints`);
  await parallel(urls, opts.concurrency, async (url) => { probes.push(await preflight(url, config.chain.id)); });
  probes.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  const valid = probes.filter((probe) => probe.chainIdValid);
  const runners = valid.map((probe) => makeRunner(`direct:${urls.indexOf(probe.url)}`, "direct",
    http(probe.url, { retryCount: 0, timeout: DIRECT_TIMEOUT_MS, batch: false }), config, probe.url));
  for (const variant of opts.variants) runners.push(makeRunner(variant, variant,
    variant === "baseline" ? baselineTransport(config) : createChainTransport(config.chain.id), config));
  const random = randomSource(opts.seed ^ config.chain.id);
  const pace = () => opts.intervalMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, opts.intervalMs))
    : Promise.resolve();

  function result(finished: boolean) {
    const serialized = runners.map(serializeRunner);
    const comparisons = opts.variants.flatMap((variant) => METHODS.map((method) => {
      const smart = runners.find((runner) => runner.kind === variant)!;
      return {
        variant, method,
        ...compareLatency(summarize(smart.samples[method]), runners.filter((runner) => runner.kind === "direct").map((runner) => ({
          id: runner.id, summary: summarize(runner.samples[method]),
        })), opts.samples),
      };
    }));
    const acceptanceComparisons = comparisons.filter((entry) => entry.variant === opts.acceptanceVariant);
    return {
      chainId: config.chain.id, name: config.chain.name, enabled: config.enabled,
      productionPolicy: RPC_POLICIES[config.chain.id],
      startedAt, finishedAt: finished ? new Date().toISOString() : null,
      configuredEndpoints: urls, preflight: probes, transports: serialized, comparisons,
      status: !finished ? "running" : acceptanceComparisons.every((entry) => entry.status === "pass") ? "pass" : acceptanceComparisons.some((entry) => entry.status === "fail") ? "fail" : "unavailable-or-insufficient",
    };
  }

  try {
    for (const method of METHODS) {
      // Initial chain checks inside smart-hyperevm do not inherit caller
      // signals. Serialize cold calls so the variants cannot co-batch them.
      await parallel(shuffled(runners, random), 1, async (runner) => {
        runner.cold[method] = await measure(runner, config, method, -1);
      });
      await pace();
    }
    checkpoint(result(false));
    for (let iteration = 0; iteration < opts.warmup; iteration++) {
      for (const method of shuffled(METHODS, random)) {
        await parallel(shuffled(runners, random), opts.concurrency, async (runner) => {
          if (runner.stopped[method]) return;
          const sample = await measure(runner, config, method, iteration);
          runner.warmup[method].push(sample);
          const attempts = [runner.cold[method]!, ...runner.warmup[method]];
          if (attempts.length >= 3 && attempts.every((entry) => !entry.success)) {
            runner.stopped[method] = "All cold and first warm-up attempts failed; no latency baseline available";
          }
        });
      }
      await pace();
    }
    console.log(`[${config.chain.id}] measuring ${opts.samples} samples per method; ${valid.length}/${urls.length} chain-valid direct endpoints`);
    for (let iteration = 0; iteration < opts.samples; iteration++) {
      for (const method of shuffled(METHODS, random)) {
        await parallel(shuffled(runners, random), opts.concurrency, async (runner) => {
          if (runner.stopped[method]) return;
          runner.samples[method].push(await measure(runner, config, method, iteration));
          const samples = runner.samples[method];
          if (samples.length >= 5 && samples.slice(-5).every((entry) => !entry.success)) {
            runner.stopped[method] = "Five consecutive measured failures; remaining samples not collected";
          }
        });
      }
      if ((iteration + 1) % 10 === 0 || iteration === opts.samples - 1) {
        console.log(`[${config.chain.id}] ${iteration + 1}/${opts.samples} rounds complete`);
        checkpoint(result(false));
      }
      if (runners.every((runner) => METHODS.every((method) => runner.stopped[method]))) break;
      if (iteration < opts.samples - 1) await pace();
    }
    const final = result(true);
    checkpoint(final);
    for (const comparison of final.comparisons) {
      console.log(`[${config.chain.id}] ${comparison.variant} ${comparison.method}: ${comparison.status} ` +
        `P50 ${comparison.p50.smartMs?.toFixed(2) ?? "n/a"} <= ${comparison.p50.limitMs?.toFixed(2) ?? "n/a"}; ` +
        `P99 ${comparison.p99.smartMs?.toFixed(2) ?? "n/a"} <= ${comparison.p99.limitMs?.toFixed(2) ?? "n/a"}`);
    }
    return final;
  } finally {
    for (const runner of runners) (runner.instance.value as Partial<HyperevmTransportValue> | undefined)?.close?.();
  }
}

async function main() {
  const opts = options();
  const sourcePaths = [
    "src/config/rpc.ts", "src/config/rpc-policies.ts", "src/config/rpc-endpoints.generated.ts",
    "scripts/benchmark-rpcs.ts", "scripts/rpc-benchmark/statistics.ts", "package.json", "bun.lock",
    "node_modules/@bloxwap/smart-hyperevm/dist/chunk-htm8ngjg.js",
  ];
  const report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(), finishedAt: null as string | null,
    status: "running",
    options: opts,
    metadata: {
      runtime: process.version, versions: process.versions, platform: process.platform,
      arch: process.arch, hostname: hostname(), gitHead: gitHead(), origin: ORIGIN,
      sourceFingerprints: Object.fromEntries(sourcePaths.map((path) => [path, fingerprint(path)])),
      sourceFingerprintsAtEnd: {} as Record<string, string | null>,
      baseline: { routing: "p2c (raced reads select best)", raceWidth: 2, hedge: false, timeoutMs: 10000, retryCount: 2, batchWaitMs: 16 },
      methodology: {
        workloads: { eth_blockNumber: [], eth_call: "FENIX totalSupply() at latest" },
        samplesPerWorkload: opts.samples, minimumSamplesForGate: MIN_SAMPLES,
        quantile: "nearest rank: sorted[ceil(p*n)-1] over successful complete responses",
        comparison: "smart P50 <= minimum healthy direct P50 AND smart P99 <= maximum healthy direct P99, with zero smart failures; no tolerance",
        acceptanceVariant: opts.acceptanceVariant,
        healthy: "chain-ID preflight passed, every requested measured sample succeeded for that workload",
        cold: "first call per method on a fresh transport; chain-ID preflight warms DNS/TLS/socket pools, and the second method follows the first",
        interleaving: "seeded shuffled transport and method order each round; one user request per transport in flight",
        cohortIsolation: "distinct stable AbortSignal per transport isolates viem's global URL/signal batch scheduler; cold calls are serial because internal chain checks do not forward caller signals",
        pacing: `At least ${opts.intervalMs}ms pause between cold method rounds and warmup/measured iterations; smart upstream racing can add requests within each round`,
        preflightRetries: "Up to three chain-ID checks, with 500ms then 1000ms backoff after transient failures; wrong-chain results are never retried; every attempt retained",
        retry: "direct HTTP retryCount=0 and timeout=10000ms; smart uses actual variant settings",
        failureHandling: "raw error timings retained; failed responses excluded from successful latency quantiles; unhealthy endpoints not accepted as a successful baseline",
        availabilityCutoff: "stop a workload after all first three cold/warmup attempts fail or five consecutive measured failures; incomplete series cannot pass",
        limitations: [
          "Single-machine Bun/Node network measurements are not browser performance guarantees. CORS preflight and response headers are reported, but CORS is not enforced by this runtime.",
          "100 samples give an empirical P99, not strong tail confidence or an SLA guarantee; use 1000+ and repeat across times/regions for stronger evidence.",
          "Concurrent chain workers share this host and public provider rate limits; benchmark load and smart racing may affect measured latency.",
          "Writes and wallet interaction are not benchmarked; no transactions are sent.",
          "Baseline freezes the original public-read options; Blink write-only endpoints are omitted because no benchmark method can use them.",
          "Block responses are checked for valid nonzero quantities and retained for review; this latency experiment does not certify canonicality or head freshness across providers.",
        ],
      },
    },
    chains: [] as unknown[],
  };
  mkdirSync(dirname(opts.output), { recursive: true });
  function save() {
    const temporary = `${opts.output}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
    renameSync(temporary, opts.output);
  }
  save();
  for (const id of opts.chainIds) {
    const config = FENIX_CHAINS.find(({ chain }) => chain.id === id)!;
    const index = report.chains.length;
    await runChain(config, opts, (chain) => { report.chains[index] = chain; save(); });
  }
  report.finishedAt = new Date().toISOString();
  report.metadata.sourceFingerprintsAtEnd = Object.fromEntries(sourcePaths.map((path) => [path, fingerprint(path)]));
  const chains = report.chains as { comparisons: { variant: string; status: string }[] }[];
  report.status = chains.every((chain) => chain.comparisons
    .filter((entry) => entry.variant === opts.acceptanceVariant)
    .every((entry) => entry.status === "pass")) ? "pass" : "not-passed";
  save();
  console.log(`Saved ${opts.output}`);
  if (report.status !== "pass") process.exitCode = 1;
}

main().catch((error) => { console.error(errorText(error)); process.exitCode = 2; });
