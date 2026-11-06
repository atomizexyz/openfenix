/** Nearest-rank empirical quantile. A missing sample set has no percentile. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new RangeError("Percentile fraction must be greater than 0 and at most 1");
  }
  if (values.length === 0) return null;
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Latency samples must be finite and nonnegative");
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

export interface LatencySample {
  iteration: number;
  startedAt: string;
  latencyMs: number;
  success: boolean;
  result?: string;
  error?: string;
}

export function summarize(samples: readonly LatencySample[]) {
  const successes = samples.filter((sample) => sample.success);
  const latencies = successes.map((sample) => sample.latencyMs);
  return {
    attempts: samples.length,
    successes: successes.length,
    errors: samples.length - successes.length,
    successRate: samples.length ? successes.length / samples.length : null,
    p50Ms: percentile(latencies, 0.5),
    p99Ms: percentile(latencies, 0.99),
    maxMs: latencies.length ? Math.max(...latencies) : null,
    // Failure timings are deliberately separate: a fast 429 is not a fast read.
    failureP50Ms: percentile(samples.filter((sample) => !sample.success).map((sample) => sample.latencyMs), 0.5),
  };
}

export type LatencySummary = ReturnType<typeof summarize>;

export interface DirectBaseline {
  id: string;
  summary: LatencySummary;
}

export function compareLatency(
  smart: LatencySummary,
  direct: readonly DirectBaseline[],
  expectedSamples: number,
) {
  const eligible = direct.filter(({ summary }) =>
    summary.attempts === expectedSamples &&
    summary.successes === expectedSamples &&
    summary.errors === 0 &&
    summary.p50Ms !== null && summary.p99Ms !== null,
  );
  const fastest = [...eligible].sort((a, b) => a.summary.p50Ms! - b.summary.p50Ms!)[0];
  const worst = [...eligible].sort((a, b) => b.summary.p99Ms! - a.summary.p99Ms!)[0];
  const enoughSamples = expectedSamples >= 100 && smart.attempts === expectedSamples;
  const reliable = smart.successes === expectedSamples && smart.errors === 0;
  const p50Pass = enoughSamples && reliable && !!fastest && smart.p50Ms !== null && smart.p50Ms <= fastest.summary.p50Ms!;
  const p99Pass = enoughSamples && reliable && !!worst && smart.p99Ms !== null && smart.p99Ms <= worst.summary.p99Ms!;
  const status = !fastest ? "unavailable" : !enoughSamples ? "insufficient-samples" : p50Pass && p99Pass ? "pass" : "fail";
  return {
    status,
    healthyDirectCount: eligible.length,
    excludedDirectIds: direct.filter((entry) => !eligible.includes(entry)).map((entry) => entry.id),
    p50: { pass: p50Pass, smartMs: smart.p50Ms, limitMs: fastest?.summary.p50Ms ?? null, directId: fastest?.id ?? null },
    p99: { pass: p99Pass, smartMs: smart.p99Ms, limitMs: worst?.summary.p99Ms ?? null, directId: worst?.id ?? null },
    allSmartRequestsSucceeded: reliable,
  };
}
