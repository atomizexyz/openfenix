import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { smartHyperevm, type HyperevmTransportValue } from "@bloxwap/smart-hyperevm/transport";

const STALE_MS = 30_000;
const RESULT = `0x${"0".repeat(63)}1`;
const openTransports: HyperevmTransportValue[] = [];

/** Exercise the installed compiled package, including its actual scoreboard. */
function pool() {
  const heads = [100, 100, 100];
  const delays = [5, 40, 80];
  const calls: { endpoint: number; method: string }[] = [];
  const transport = smartHyperevm({
    endpoints: delays.map((_delay, index) => ({ url: `https://rpc-${index}.example`, label: `rpc-${index}` })),
    routing: "best",
    race: false,
    hedge: false,
    cache: false,
    coalesce: false,
    pinLatest: false,
    headLag: { probeInterval: false, staleMs: STALE_MS, maxLag: 2 },
    fetchFn: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const endpoint = Number(url.hostname.split(".")[0]!.slice(4));
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      calls.push({ endpoint, method: request.method });
      await new Promise<void>((resolve) => setTimeout(resolve, delays[endpoint]));
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: request.method === "eth_chainId"
          ? "0x3e7"
          : request.method === "eth_blockNumber"
            ? `0x${heads[endpoint]!.toString(16)}`
            : RESULT,
      }), { headers: { "content-type": "application/json" } });
    },
  })({});
  const value = transport.value as HyperevmTransportValue;
  openTransports.push(value);
  return { transport, value, heads, calls };
}

async function finish<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(200);
  return pending;
}

const read = { method: "eth_call", params: [{ to: "0x0000000000000000000000000000000000000001", data: "0x18160ddd" }, "latest"] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  for (const value of openTransports.splice(0)) value.close();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("RPC head freshness", () => {
  it("expires the lag penalty on an unrefreshed endpoint while peers keep advancing", async () => {
    const { transport, value, heads, calls } = pool();
    await finish(value.probe());
    for (let i = 0; i < 6; i += 1) await finish(transport.request(read));
    expect(value.snapshot()[0]!.methods["eth_call"]?.ewma).toBe(5);

    // A lagging observation excludes the fastest provider from ordinary reads.
    heads[1] = 200;
    heads[2] = 200;
    const lastProbeStarted = Date.now();
    await finish(value.probe());
    const fresh = value.snapshot();
    expect(fresh[0]!.lag).toBe(100);
    expect(fresh[0]!.score).toBeGreaterThan(fresh[1]!.score);
    const beforeFreshRead = calls.length;
    await finish(transport.request(read));
    expect(calls.slice(beforeFreshRead).filter(({ method }) => method === "eth_call")).toEqual([
      { endpoint: 1, method: "eth_call" },
    ]);

    // Refresh a peer immediately before the fast endpoint's observation expires.
    // The peer remains fresh afterward, so a missing subject-age check cannot hide
    // behind all heads aging out together.
    await vi.advanceTimersByTimeAsync(lastProbeStarted + STALE_MS - Date.now());
    heads[1] = 300;
    await finish(transport.request({ method: "eth_blockNumber" }));
    const expired = value.snapshot();
    expect(expired[1]!.head).toBe(300);
    expect(expired[0]!.head).toBe(100);
    expect(expired[0]!.lag).toBeNull();
    expect(expired[0]!.score).toBeLessThan(expired[1]!.score);

    // Eligibility must affect real dispatch, not only the diagnostic snapshot.
    const beforeRecoveredRead = calls.length;
    let elapsed: number | undefined;
    const started = Date.now();
    const pending = transport.request(read).then((response) => {
      elapsed = Date.now() - started;
      return response;
    });
    await expect(finish(pending)).resolves.toBe(RESULT);
    expect(elapsed).toBe(5);
    expect(calls.slice(beforeRecoveredRead).filter(({ method }) => method === "eth_call")).toEqual([
      { endpoint: 0, method: "eth_call" },
    ]);
  });
});
