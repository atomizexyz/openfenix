import { describe, expect, it, vi } from "vitest";
import { http } from "viem";
import {
  compareLatency,
  percentile,
  summarize,
  type LatencySample,
} from "../../scripts/rpc-benchmark/statistics";

function samples(latencies: readonly number[], success = true): LatencySample[] {
  return latencies.map((latencyMs, iteration) => ({
    iteration,
    startedAt: "2026-01-01T00:00:00.000Z",
    latencyMs,
    success,
  }));
}

/** The two tail samples make nearest-rank P99 the supplied tail at n = 100. */
function observations(median: number, tail = median): LatencySample[] {
  return samples([...Array<number>(98).fill(median), tail, tail]);
}

function baseline(id: string, median: number, tail = median) {
  return { id, summary: summarize(observations(median, tail)) };
}

describe("RPC benchmark percentile calculations", () => {
  it("uses nearest rank, including the lower central value for an even sample count", () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.99)).toBe(99);
    expect(percentile(values, 1)).toBe(100);
    expect(values[0]).toBe(100);
  });

  it("does not invent a percentile for missing observations", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([12], 0.99)).toBe(12);
  });

  it.each([0, -0.5, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid percentile fraction %s",
    (fraction) => expect(() => percentile([1], fraction)).toThrow(RangeError),
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid elapsed time %s",
    (latency) => expect(() => percentile([latency], 0.5)).toThrow(RangeError),
  );
});

describe("RPC benchmark success and failure accounting", () => {
  it("keeps fast errors and slow failures out of successful response percentiles", () => {
    const summary = summarize([
      ...samples([100, 200]),
      ...samples([1, 10_000], false),
    ]);

    expect(summary).toEqual({
      attempts: 4,
      successes: 2,
      errors: 2,
      successRate: 0.5,
      p50Ms: 100,
      p99Ms: 200,
      maxMs: 200,
      failureP50Ms: 1,
    });
  });

  it("distinguishes an unavailable connection from one never measured", () => {
    expect(summarize(samples([1, 2, 3], false))).toMatchObject({
      attempts: 3, successes: 0, errors: 3, successRate: 0,
      p50Ms: null, p99Ms: null, maxMs: null, failureP50Ms: 2,
    });
    expect(summarize([])).toMatchObject({
      attempts: 0, successRate: null, p50Ms: null, p99Ms: null,
    });
  });
});

describe("RPC benchmark latency acceptance gates", () => {
  const direct = [baseline("fast", 10, 100), baseline("slow", 20, 500)];

  it("compares P50 to the fastest median and P99 to the worst tail independently", () => {
    const result = compareLatency(summarize(observations(10, 500)), direct, 100);

    expect(result.status).toBe("pass");
    expect(result.p50).toEqual({ pass: true, smartMs: 10, limitMs: 10, directId: "fast" });
    expect(result.p99).toEqual({ pass: true, smartMs: 500, limitMs: 500, directId: "slow" });
  });

  it("does not round away or tolerate a median regression", () => {
    const result = compareLatency(summarize(observations(10.0001, 100)), direct, 100);
    expect(result.status).toBe("fail");
    expect(result.p50.pass).toBe(false);
    expect(result.p99.pass).toBe(true);
  });

  it("fails the tail target even when the median improves", () => {
    const result = compareLatency(summarize(observations(5, 500.0001)), direct, 100);
    expect(result.status).toBe("fail");
    expect(result.p50.pass).toBe(true);
    expect(result.p99.pass).toBe(false);
  });

  it("cannot pass by responding quickly with errors", () => {
    const smart = observations(1);
    smart[99] = { ...smart[99], success: false, error: "HTTP 429" };
    const result = compareLatency(summarize(smart), direct, 100);
    expect(result.status).toBe("fail");
    expect(result.allSmartRequestsSucceeded).toBe(false);
    expect(result.p50.pass).toBe(false);
    expect(result.p99.pass).toBe(false);
  });

  it("excludes incomplete and failed direct series without treating them as fast baselines", () => {
    const mixed = observations(0.1);
    mixed[50] = { ...mixed[50], success: false, error: "Invalid result" };
    const result = compareLatency(summarize(observations(10)), [
      baseline("healthy", 10),
      { id: "failed", summary: summarize(mixed) },
      { id: "incomplete", summary: summarize(samples([0.1])) },
    ], 100);

    expect(result.status).toBe("pass");
    expect(result.healthyDirectCount).toBe(1);
    expect(result.excludedDirectIds).toEqual(["failed", "incomplete"]);
    expect(result.p50.directId).toBe("healthy");
    expect(result.p99.directId).toBe("healthy");
  });

  it("marks an absent healthy direct cohort unavailable instead of passing", () => {
    const result = compareLatency(summarize(observations(1)), [
      { id: "unreachable", summary: summarize(samples([1, 1, 1], false)) },
    ], 100);
    expect(result.status).toBe("unavailable");
    expect(result.healthyDirectCount).toBe(0);
    expect(result.p50).toMatchObject({ pass: false, limitMs: null, directId: null });
    expect(result.p99).toMatchObject({ pass: false, limitMs: null, directId: null });
  });

  it("does not accept a completed low-sample run as sufficient P99 evidence", () => {
    const summary = summarize(samples(Array<number>(99).fill(1)));
    const result = compareLatency(summary, [{ id: "direct", summary }], 99);
    expect(result.status).toBe("insufficient-samples");
    expect(result.p50.pass).toBe(false);
    expect(result.p99.pass).toBe(false);
  });

  it("does not accept a smart series stopped before the requested sample count", () => {
    const result = compareLatency(summarize(samples(Array<number>(99).fill(1))), direct, 100);
    expect(result.status).toBe("insufficient-samples");
    expect(result.allSmartRequestsSucceeded).toBe(false);
    expect(result.p50.pass).toBe(false);
    expect(result.p99.pass).toBe(false);
  });
});

describe("RPC benchmark cohort isolation", () => {
  it("keeps different variants' batch delays separate even when they share an endpoint", async () => {
    vi.useFakeTimers();
    const posts: { at: number; size: number }[] = [];
    const started = Date.now();
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      const requests = JSON.parse(String(init?.body)) as { id: number }[];
      posts.push({ at: Date.now() - started, size: requests.length });
      return new Response(JSON.stringify(requests.map(({ id }) => ({
        jsonrpc: "2.0", id, result: "0x1",
      }))), { headers: { "content-type": "application/json" } });
    }));

    try {
      const endpoint = "https://benchmark-cohort.example/rpc";
      const baselineTransport = http(endpoint, { batch: { wait: 16 }, retryCount: 0 })({});
      const productionTransport = http(endpoint, { batch: { wait: 0 }, retryCount: 0 })({});
      const responses = Promise.all([
        baselineTransport.request({ method: "eth_blockNumber" }, { signal: new AbortController().signal }),
        productionTransport.request({ method: "eth_blockNumber" }, { signal: new AbortController().signal }),
      ]);

      await vi.advanceTimersByTimeAsync(20);
      await expect(responses).resolves.toEqual(["0x1", "0x1"]);
      expect(posts).toEqual([{ at: 0, size: 1 }, { at: 16, size: 1 }]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
