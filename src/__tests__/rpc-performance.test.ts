import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HyperevmTransportValue } from "@bloxwap/smart-hyperevm/transport";
import { http, type Chain, type Transport } from "viem";
import { FENIX_CHAINS } from "@/config/chains";
import { GENERATED_RPC_ENDPOINTS } from "@/config/rpc-endpoints.generated";

type RpcRequest = { id: number; method: string; params?: unknown };
type Call = { url: string; method: string; at: number };
type Instance = ReturnType<Transport>;
const openTransports: HyperevmTransportValue[] = [];
const read = {
  method: "eth_call",
  params: [{ to: "0x0000000000000000000000000000000000000001", data: "0x18160ddd" }, "latest"],
};
const result = `0x${"0".repeat(63)}1`;

function urls(chain: Chain): string[] {
  const generated = GENERATED_RPC_ENDPOINTS[chain.id]?.http ?? [];
  return (generated.length ? generated : chain.rpcUrls.default.http).map(
    (url) => new URL(url).href,
  );
}

/** Network service time is deterministic; router scheduling is still real code. */
function network(
  chain: Chain,
  latency: (endpoint: number, request: RpcRequest) => number,
  wrongChain = new Set<number>(),
): Call[] {
  const endpoints = urls(chain);
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).href;
    const endpoint = endpoints.indexOf(url);
    if (endpoint < 0) throw new Error(`Unexpected endpoint ${url}`);
    const body = JSON.parse(String(init?.body)) as RpcRequest | RpcRequest[];
    const requests = Array.isArray(body) ? body : [body];
    const responses = await Promise.all(requests.map((request) => {
      calls.push({ url, method: request.method, at: Date.now() });
      return new Promise<{ jsonrpc: string; id: number; result: string }>((resolve, reject) => {
        const signal = init?.signal;
        const finish = () => {
          signal?.removeEventListener("abort", abort);
          resolve({
            jsonrpc: "2.0",
            id: request.id,
            result: request.method === "eth_chainId"
              ? `0x${(wrongChain.has(endpoint) ? chain.id + 1 : chain.id).toString(16)}`
              : result,
          });
        };
        const timer = setTimeout(finish, latency(endpoint, request));
        const abort = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    }));
    return new Response(JSON.stringify(Array.isArray(body) ? responses : responses[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
  return calls;
}

async function smart(chain: Chain): Promise<Instance> {
  const { createChainTransport } = await import("@/config/rpc");
  const instance = createChainTransport(chain.id)({ chain });
  openTransports.push(instance.value as HyperevmTransportValue);
  return instance;
}

async function measure(instance: Instance, budgetMs = 150): Promise<number> {
  const started = Date.now();
  let elapsed: number | undefined;
  let received: unknown;
  let failure: unknown;
  const pending = instance.request(read).then(
    (value) => { elapsed = Date.now() - started; received = value; },
    (error) => { failure = error; },
  );
  await vi.advanceTimersByTimeAsync(budgetMs);
  expect(failure).toBeUndefined();
  expect(elapsed, `read did not succeed within ${budgetMs}ms`).toBeDefined();
  await pending;
  expect(received).toBe(result);
  return elapsed!;
}

function percentile(samples: number[], fraction: number): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1]!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  vi.stubEnv("NEXT_PUBLIC_BLINK_API_KEY", "");
  vi.resetModules();
});

afterEach(() => {
  for (const value of openTransports.splice(0)) value.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("smart RPC latency regression coverage", () => {
  it.each(FENIX_CHAINS.map(({ chain }) => [chain.name, chain] as const))(
    "%s: warm reads match the fastest direct connection without caching",
    async (_name, chain) => {
      const calls = network(chain, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint === 0 ? 20 : 100);
      const instance = await smart(chain);
      const direct = http(urls(chain)[0]!, { retryCount: 0, batch: false })({ chain });
      const fastest = await measure(direct);
      for (let i = 0; i < 6; i += 1) await measure(instance);
      const upstreamBefore = calls.filter(({ method }) => method === "eth_call").length;
      const samples: number[] = [];
      for (let i = 0; i < 100; i += 1) samples.push(await measure(instance));

      expect(percentile(samples, 0.5)).toBeLessThanOrEqual(fastest);
      expect(percentile(samples, 0.99)).toBeLessThanOrEqual(urls(chain).length > 1 ? 100 : fastest);
      expect(calls.filter(({ method }) => method === "eth_call").length - upstreamBefore).toBeGreaterThanOrEqual(100);
      expect((instance.value as HyperevmTransportValue).cacheStats()).toMatchObject({ hits: 0, entries: 0 });
    },
  );

  it.each(FENIX_CHAINS.filter(({ chain }) => urls(chain).length > 1).map(({ chain }) => [chain.name, chain] as const))(
    "%s: a warm backup wins when the fastest connection stalls",
    async (_name, chain) => {
      let stalled = false;
      network(chain, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint === 0 ? stalled ? 30_000 : 20 : 100);
      const instance = await smart(chain);
      for (let i = 0; i < 6; i += 1) await measure(instance);
      stalled = true;

      expect(await measure(instance)).toBeLessThanOrEqual(100);
    },
  );

  it("keeps learned scores and quarantines isolated between chains", async () => {
    const instances = await Promise.all(FENIX_CHAINS.map(({ chain }) => smart(chain)));
    const ethereum = FENIX_CHAINS[0]!.chain;
    const calls = network(ethereum, (_endpoint, request) => request.method === "eth_chainId" ? 0 : 20, new Set([0]));

    await measure(instances[0]!);

    const first = instances[0]!.value as HyperevmTransportValue;
    expect(first.snapshot().some(({ quarantined }) => quarantined)).toBe(true);
    expect(calls.some(({ url, method }) => url === urls(ethereum)[0] && method === "eth_call")).toBe(false);
    for (const instance of instances.slice(1)) {
      const snapshot = (instance.value as HyperevmTransportValue).snapshot();
      expect(snapshot.every(({ quarantined, methods }) => !quarantined && methods["*"]?.n === 0)).toBe(true);
    }
  });

  it("applies a chain's own racing rules without changing another chain", async () => {
    const { RPC_POLICIES } = await import("@/config/rpc-policies");
    const first = FENIX_CHAINS.find(({ chain }) => chain.id === 1)!.chain;
    const second = FENIX_CHAINS.find(({ chain }) => chain.id === 137)!.chain;
    const original = RPC_POLICIES[first.id]!;
    RPC_POLICIES[first.id] = { ...original, raceWidth: false, hedge: false };
    try {
      const firstCalls = network(first, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint === 0 ? 30 : 5);
      const firstInstance = await smart(first);
      for (let i = 0; i < 6; i += 1) await measure(firstInstance);
      expect(await measure(firstInstance)).toBe(30);
      expect(firstCalls.filter(({ method }) => method === "eth_call")).toHaveLength(7);

      const secondCalls = network(second, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint === 0 ? 30 : 5);
      const secondInstance = await smart(second);
      for (let i = 0; i < 6; i += 1) await measure(secondInstance);
      expect(await measure(secondInstance)).toBe(5);
      expect(secondCalls.filter(({ method }) => method === "eth_call").length).toBeGreaterThan(7);
    } finally {
      RPC_POLICIES[first.id] = original;
    }
  });

  it.each(FENIX_CHAINS.filter(({ chain }) => urls(chain).length > 2).map(({ chain }) => [chain.name, chain] as const))(
    "%s: a third connection rescues a stalled primary race before its attempt deadline",
    async (_name, chain) => {
      const { RPC_POLICIES } = await import("@/config/rpc-policies");
      const original = RPC_POLICIES[chain.id]!;
      try {
        RPC_POLICIES[chain.id] = { ...original, hedge: false };
        let baselineStalled = false;
        network(chain, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint < 2 ? baselineStalled ? 30_000 : 20 + endpoint * 20 : 100);
        const baseline = await smart(chain);
        for (let i = 0; i < 6; i += 1) await measure(baseline);
        baselineStalled = true;
        const unhedgedMs = await measure(baseline, 11_000);
        expect(unhedgedMs).toBeGreaterThanOrEqual(original.timeoutMs);

        RPC_POLICIES[chain.id] = original;
        let stalled = false;
        const calls = network(chain, (endpoint, request) => request.method === "eth_chainId" ? 0 : endpoint < 2 ? stalled ? 30_000 : 20 + endpoint * 20 : 100);
        const instance = await smart(chain);
        for (let i = 0; i < 6; i += 1) await measure(instance);
        const before = calls.length;
        stalled = true;

        const hedgedMs = await measure(instance, 500);
        expect(hedgedMs).toBeLessThan(500);
        expect(hedgedMs).toBeLessThan(unhedgedMs);
        const reads = calls.slice(before).filter(({ method }) => method === "eth_call");
        expect(reads).toHaveLength(3);
        expect(reads.some(({ url }) => url === urls(chain)[2])).toBe(true);
      } finally {
        RPC_POLICIES[chain.id] = original;
      }
    },
  );
});
