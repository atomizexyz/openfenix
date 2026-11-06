/** Aggregate completed RPC experiments; baseline results never decide the gate. */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { FENIX_CHAINS } from "../src/config/chains";
import { RPC_POLICIES } from "../src/config/rpc-policies";
import { GENERATED_RPC_ENDPOINTS } from "../src/config/rpc-endpoints.generated";
import { compareLatency, summarize, type LatencySample } from "./rpc-benchmark/statistics";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CURRENT_RPC_FINGERPRINT = createHash("sha256").update(readFileSync(resolve(ROOT, "src/config/rpc.ts"))).digest("hex");
const ROUTER_DEPENDENCY_PATH = "node_modules/@bloxwap/smart-hyperevm/dist/chunk-htm8ngjg.js";
const CURRENT_DEPENDENCY_FINGERPRINT = createHash("sha256").update(readFileSync(resolve(ROOT, ROUTER_DEPENDENCY_PATH))).digest("hex");
const METHODS = ["eth_blockNumber", "eth_call"] as const;
type Method = typeof METHODS[number];

interface Probe {
  url: string;
  chainIdValid: boolean;
  chainId: string | null;
  corsPreflight: boolean;
  corsPost: boolean;
  error: string | null;
}

interface TransportResult {
  id: string;
  kind: "direct" | "baseline" | "production";
  url?: string;
  cold: Partial<Record<Method, LatencySample>>;
  warmup: Partial<Record<Method, LatencySample[]>>;
  samples: Partial<Record<Method, LatencySample[]>>;
  stopped: Partial<Record<Method, string>>;
  telemetry: {
    upstreamRequests: number;
    upstreamByMethod: Record<string, number>;
    corsRejectedResponses: number;
    events: Record<string, number>;
  };
}

interface ChainResult {
  chainId: number;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  productionPolicy?: unknown;
  configuredEndpoints: string[];
  preflight: Probe[];
  transports: TransportResult[];
}

interface BenchmarkResult {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string | null;
  options: { samples: number; concurrency: number; variants: string[] };
  metadata: {
    sourceFingerprints: Record<string, string | null>;
    sourceFingerprintsAtEnd: Record<string, string | null>;
    methodology?: { cohortIsolation?: string; limitations?: string[] };
  };
  chains: ChainResult[];
}

interface Candidate {
  sourceFile: string;
  report: BenchmarkResult;
  chain: ChainResult;
}

function arg(name: string, fallback: string): string {
  return process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
}

function completedTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function sampleCounts(transport: TransportResult | undefined) {
  return {
    measured: METHODS.reduce((total, method) => total + (transport?.samples[method]?.length ?? 0), 0),
    warmup: METHODS.reduce((total, method) => total + (transport?.warmup[method]?.length ?? 0), 0),
    cold: METHODS.filter((method) => transport?.cold[method]).length,
  };
}

function amplification(transport: TransportResult | undefined) {
  if (!transport) return null;
  const counts = sampleCounts(transport);
  const logicalRequests = counts.measured + counts.warmup + counts.cold;
  const telemetry = transport.telemetry;
  const upstreamReads = METHODS.reduce((total, method) => total + (telemetry.upstreamByMethod[method] ?? 0), 0);
  return {
    phases: "cold + warmup + measured",
    logicalRequests,
    upstreamHttpRequests: telemetry.upstreamRequests,
    upstreamReadCalls: upstreamReads,
    upstreamChainChecks: telemetry.upstreamByMethod.eth_chainId ?? 0,
    httpRequestsPerLogicalRequest: logicalRequests ? telemetry.upstreamRequests / logicalRequests : null,
    readCallsPerLogicalRequest: logicalRequests ? upstreamReads / logicalRequests : null,
    measuredOnlyAmplification: null,
    note: "Source telemetry spans all phases; measured-only amplification cannot be recovered.",
    events: telemetry.events,
  };
}

function summarizeChain(candidate: Candidate) {
  const { chain, report, sourceFile } = candidate;
  const production = chain.transports.find((transport) => transport.kind === "production");
  const baseline = chain.transports.find((transport) => transport.kind === "baseline");
  const direct = chain.transports.filter((transport) => transport.kind === "direct");
  const expectedSamples = report.options.samples;
  const workloads = METHODS.map((method) => {
    const smart = summarize(production?.samples[method] ?? []);
    const before = summarize(baseline?.samples[method] ?? []);
    const endpoints = direct.map((transport) => ({ id: transport.id, summary: summarize(transport.samples[method] ?? []) }));
    // Recompute from raw samples instead of trusting rounded or saved comparisons.
    const gate = compareLatency(smart, endpoints, expectedSamples);
    const fastest = direct.find((transport) => transport.id === gate.p50.directId);
    const worst = direct.find((transport) => transport.id === gate.p99.directId);
    return {
      method,
      status: production ? gate.status : "missing-production",
      smart,
      baseline: baseline ? before : null,
      p50: { ...gate.p50, directUrl: fastest?.url ?? null },
      p99: { ...gate.p99, directUrl: worst?.url ?? null },
      allSmartRequestsSucceeded: gate.allSmartRequestsSucceeded,
      healthyDirectCount: gate.healthyDirectCount,
      fullSampleDirectCount: endpoints.filter((entry) => entry.summary.attempts === expectedSamples).length,
      configuredEndpointCount: chain.configuredEndpoints.length,
      measuredDirectAttempts: endpoints.reduce((sum, entry) => sum + entry.summary.attempts, 0),
      measuredDirectSuccesses: endpoints.reduce((sum, entry) => sum + entry.summary.successes, 0),
      measuredDirectErrors: endpoints.reduce((sum, entry) => sum + entry.summary.errors, 0),
      excludedDirect: direct.filter((transport) => gate.excludedDirectIds.includes(transport.id)).map((transport) => ({
        id: transport.id, url: transport.url, summary: summarize(transport.samples[method] ?? []), stopped: transport.stopped[method] ?? null,
      })),
    };
  });
  const changedSources = Object.keys(report.metadata.sourceFingerprints).filter((path) =>
    report.metadata.sourceFingerprints[path] !== report.metadata.sourceFingerprintsAtEnd[path],
  );
  const currentChain = FENIX_CHAINS.find((config) => config.chain.id === chain.chainId)?.chain;
  const generatedUrls = GENERATED_RPC_ENDPOINTS[chain.chainId]?.http ?? [];
  const currentUrls = [...new Set(generatedUrls.length ? generatedUrls : currentChain?.rpcUrls.default.http ?? [])];
  const policyMatchesCurrentSource = JSON.stringify(chain.productionPolicy) === JSON.stringify(RPC_POLICIES[chain.chainId]);
  const endpointsMatchCurrentSource = JSON.stringify(chain.configuredEndpoints) === JSON.stringify(currentUrls);
  const rpcSourceMatchesCurrentSource = report.metadata.sourceFingerprints["src/config/rpc.ts"] === CURRENT_RPC_FINGERPRINT;
  const dependencyMatchesCurrentSource = report.metadata.sourceFingerprints[ROUTER_DEPENDENCY_PATH] === CURRENT_DEPENDENCY_FINGERPRINT;
  const configurationMatchesCurrentSource = endpointsMatchCurrentSource && rpcSourceMatchesCurrentSource;
  const staleReasons = [
    ...(!policyMatchesCurrentSource ? ["The measured chain policy differs from the current policy"] : []),
    ...(!endpointsMatchCurrentSource ? ["The measured endpoint URLs or their order differ from current configuration"] : []),
    ...(!rpcSourceMatchesCurrentSource ? ["The measured src/config/rpc.ts fingerprint differs from current source"] : []),
    ...(!dependencyMatchesCurrentSource ? ["The measured smart-hyperevm router fingerprint is missing or differs from the installed dependency"] : []),
  ];
  const empiricalStatus = workloads.every((workload) => workload.status === "pass") ? "pass"
    : workloads.some((workload) => workload.status === "fail") ? "fail" : "unavailable-or-insufficient";
  const counts = chain.transports.map(sampleCounts);
  return {
    chainId: chain.chainId, name: chain.name,
    status: !dependencyMatchesCurrentSource ? "stale-dependency" : !configurationMatchesCurrentSource ? "stale-configuration" : !policyMatchesCurrentSource ? "stale-policy" : empiricalStatus,
    empiricalStatus,
    sourceFile,
    startedAt: chain.startedAt,
    finishedAt: chain.finishedAt,
    sourceFingerprints: report.metadata.sourceFingerprints,
    sourceFingerprintsAtEnd: report.metadata.sourceFingerprintsAtEnd,
    sourceFilesChangedDuringRun: changedSources,
    productionPolicy: chain.productionPolicy ?? null,
    policyMatchesCurrentSource,
    configurationMatchesCurrentSource,
    endpointsMatchCurrentSource,
    rpcSourceMatchesCurrentSource,
    dependencyMatchesCurrentSource,
    staleReasons,
    expectedSamplesPerWorkload: expectedSamples,
    concurrency: report.options.concurrency,
    configuredEndpointCount: chain.configuredEndpoints.length,
    chainIdVerifiedEndpointCount: chain.preflight.filter((probe) => probe.chainIdValid).length,
    untestedEndpoints: chain.preflight.filter((probe) => !direct.some((transport) => transport.url === probe.url)).map((probe) => ({
      url: probe.url, chainIdValid: probe.chainIdValid, reportedChainId: probe.chainId, reason: probe.error ?? "No direct transport samples",
    })),
    cors: {
      browserPerformanceVerified: false,
      preflightPassedEndpoints: chain.preflight.filter((probe) => probe.corsPreflight).length,
      postHeaderPassedEndpoints: chain.preflight.filter((probe) => probe.corsPost).length,
      bothPassedEndpoints: chain.preflight.filter((probe) => probe.corsPreflight && probe.corsPost).length,
      endpointIssues: chain.preflight.filter((probe) => !probe.corsPreflight || !probe.corsPost).map((probe) => ({
        url: probe.url, preflightPassed: probe.corsPreflight, postHeaderPassed: probe.corsPost, error: probe.error,
      })),
      productionResponsesWithoutAllowedOrigin: production?.telemetry.corsRejectedResponses ?? null,
      baselineResponsesWithoutAllowedOrigin: baseline?.telemetry.corsRejectedResponses ?? null,
      note: "Bun/Node does not enforce CORS; these are diagnostics and the latency gate is runtime-only.",
    },
    sampleCounts: {
      measured: counts.reduce((sum, count) => sum + count.measured, 0),
      warmup: counts.reduce((sum, count) => sum + count.warmup, 0),
      cold: counts.reduce((sum, count) => sum + count.cold, 0),
      production: sampleCounts(production),
      baseline: sampleCounts(baseline),
    },
    amplification: { production: amplification(production), baseline: amplification(baseline) },
    workloads,
  };
}

function main() {
  for (const value of process.argv.slice(2)) {
    if (!/^--(?:input|output)=.+/.test(value)) throw new Error(`Unknown argument: ${value}`);
  }
  const input = resolve(arg("input", resolve(ROOT, "artifacts/rpc-performance")));
  const output = resolve(arg("output", resolve(input, "summary.json")));
  const candidates = new Map<number, Candidate>();
  const ignoredFiles: { file: string; reason: string }[] = [];
  const entries = readdirSync(input, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fullPath = resolve(input, entry.name);
    if (fullPath === output) continue;
    const sourceFile = relative(ROOT, fullPath);
    if (/contaminat|partial|interrupted|pre-isolation/i.test(entry.name)) {
      ignoredFiles.push({ file: sourceFile, reason: "Contaminated or partial experiment" });
      continue;
    }
    let report: BenchmarkResult;
    try { report = JSON.parse(readFileSync(fullPath, "utf8")) as BenchmarkResult; }
    catch { ignoredFiles.push({ file: sourceFile, reason: "Invalid JSON" }); continue; }
    if (report.schemaVersion !== 1 || !Array.isArray(report.chains) || !report.options || !report.metadata?.sourceFingerprints) {
      ignoredFiles.push({ file: sourceFile, reason: "Not a benchmark schemaVersion=1 report" });
      continue;
    }
    if (!completedTimestamp(report.finishedAt)) {
      ignoredFiles.push({ file: sourceFile, reason: "Experiment is not finished" });
      continue;
    }
    for (const chain of report.chains) {
      if (!completedTimestamp(chain.finishedAt) || !Array.isArray(chain.transports)) continue;
      // Old both-variant batched experiments shared viem's global scheduler.
      const policy = chain.productionPolicy as { batchWaitMs?: number | false } | undefined;
      if (report.options.variants.includes("baseline") && report.options.variants.includes("production") &&
        GENERATED_RPC_ENDPOINTS[chain.chainId]?.batch &&
        policy?.batchWaitMs !== false && !report.metadata.methodology?.cohortIsolation) {
        ignoredFiles.push({ file: sourceFile, reason: `Chain ${chain.chainId}: batched cohorts were not isolated` });
        continue;
      }
      const previous = candidates.get(chain.chainId);
      if (!previous || Date.parse(chain.finishedAt) > Date.parse(previous.chain.finishedAt!)) {
        candidates.set(chain.chainId, { sourceFile, report, chain });
      }
    }
  }
  const chains = FENIX_CHAINS.map(({ chain }) => {
    const candidate = candidates.get(chain.id);
    return candidate ? summarizeChain(candidate) : {
      chainId: chain.id, name: chain.name, status: "missing", workloads: [],
      reason: "No finished, uncontaminated experiment is available",
    };
  });
  const missing = chains.filter((chain) => chain.status === "missing");
  const empiricalComparisons = chains.flatMap((chain) => chain.workloads);
  const currentChains = chains.filter((chain) => "policyMatchesCurrentSource" in chain &&
    chain.policyMatchesCurrentSource && chain.configurationMatchesCurrentSource && chain.dependencyMatchesCurrentSource);
  const comparisons = currentChains.flatMap((chain) => chain.workloads);
  const summary = {
    summarySchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: "Single-machine Bun/Node read latency; browser behavior and head freshness are not certified",
    status: missing.length ? "incomplete" : chains.every((chain) => chain.status === "pass") ? "pass" : "not-passed",
    expectedChainCount: FENIX_CHAINS.length,
    completedChainCount: chains.length - missing.length,
    currentConfigurationChainCount: currentChains.length,
    missingChainIds: missing.map((chain) => chain.chainId),
    staleChainIds: chains.filter((chain) => chain.status.startsWith("stale-")).map((chain) => chain.chainId),
    passingChainCount: chains.filter((chain) => chain.status === "pass").length,
    expectedWorkloadCount: FENIX_CHAINS.length * METHODS.length,
    productionP50PassedCount: comparisons.filter((entry) => entry.p50.pass).length,
    productionP99PassedCount: comparisons.filter((entry) => entry.p99.pass).length,
    empiricalProductionP50PassedCount: empiricalComparisons.filter((entry) => entry.p50.pass).length,
    empiricalProductionP99PassedCount: empiricalComparisons.filter((entry) => entry.p99.pass).length,
    passCountScope: "Only reports matching the current chain policy, ordered endpoint URLs, src/config/rpc.ts fingerprint, and installed smart-hyperevm router fingerprint count toward production passes",
    measuredSampleCount: chains.reduce((sum, chain) => sum + ("sampleCounts" in chain ? chain.sampleCounts.measured : 0), 0),
    upstreamAmplificationScope: "All phases, including cold/warmup; measured-only counts were not collected",
    selection: "Latest completed, uncontaminated report per chain; production-only exact gates recomputed from raw samples",
    ignoredFiles,
    chains,
  };
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(summary, null, 2)}\n`);
  renameSync(temporary, output);

  const ms = (value: number | null | undefined) => value == null ? "—" : value.toFixed(2);
  console.log("| Chain | Read | Smart P50 / fastest ms | Smart P99 / worst ms | Baseline P50 / P99 ms | Healthy / full / all | Result |");
  console.log("|---|---|---:|---:|---:|---:|---|");
  for (const chain of chains) {
    if (chain.status === "missing") {
      console.log(`| ${chain.name} (${chain.chainId}) | both | — | — | — | — | missing |`);
      continue;
    }
    for (const workload of chain.workloads) {
      console.log(`| ${chain.name} (${chain.chainId}) | ${workload.method} | ` +
        `${ms(workload.smart.p50Ms)} / ${ms(workload.p50.limitMs)} | ` +
        `${ms(workload.smart.p99Ms)} / ${ms(workload.p99.limitMs)} | ` +
        `${ms(workload.baseline?.p50Ms)} / ${ms(workload.baseline?.p99Ms)} | ` +
        `${workload.healthyDirectCount} / ${workload.fullSampleDirectCount} / ${workload.configuredEndpointCount} | ` +
        `${chain.status.startsWith("stale-") ? `${chain.status} (${workload.status})` : workload.status} |`);
    }
  }
  console.log(`\n${summary.completedChainCount}/${summary.expectedChainCount} chains complete; ${summary.currentConfigurationChainCount} match current configuration; ${summary.passingChainCount} pass both read workloads. ` +
    `Production P50 passes ${summary.productionP50PassedCount}/${summary.expectedWorkloadCount}; P99 ${summary.productionP99PassedCount}/${summary.expectedWorkloadCount}.`);
  console.log(`Saved ${relative(ROOT, output)} (${summary.status})`);
  if (summary.status !== "pass") process.exitCode = 1;
}

main();
